"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowUpRight,
  BookmarkCheck,
  Check,
  ChevronDown,
  GitCompareArrows,
  LoaderCircle,
  MoreHorizontal,
  RotateCcw,
  Search,
  SlidersHorizontal,
  StickyNote,
  X,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  addJobNoteAction,
  restoreJobToDeckAction,
  updateJobStatusAction,
} from "@/features/jobs/actions";
import { CompanyMark } from "@/features/jobs/components/company-mark";
import { companyVisual } from "@/features/jobs/components/company-visual";
import type {
  JobCardDecision,
  JobCardViewModel,
} from "@/features/jobs/components/job-card";
import { cn } from "@/lib/utils";

const PIPELINE_STATUSES = [
  "saved",
  "stretch",
  "learn_first",
  "apply",
  "applied",
  "interview",
  "offer",
  "rejected",
  "archived",
] as const satisfies readonly JobCardDecision[];

type PipelineStatus = (typeof PIPELINE_STATUSES)[number];
type StatusFilter = "all" | "shortlist" | "learning" | "applications" | "closed";
type SortKey = "fit" | "career" | "salary" | "stretch" | "company";

const STATUS_META: Record<PipelineStatus, { label: string }> = {
  saved: { label: "Saved" },
  stretch: { label: "Stretch" },
  learn_first: { label: "Learn first" },
  apply: { label: "Planning to apply" },
  applied: { label: "Applied" },
  interview: { label: "Interview" },
  offer: { label: "Offer" },
  rejected: { label: "Closed" },
  archived: { label: "Archived" },
};

const DISPOSITION_META: Record<
  JobCardViewModel["verdict"],
  { label: string; tone: string }
> = {
  "Strong Apply": {
    label: "Strong opportunity",
    tone: "text-[#65d7aa]",
  },
  Apply: {
    label: "Worth applying",
    tone: "text-[#65d7aa]",
  },
  "Apply as a Stretch": {
    label: "Credible stretch",
    tone: "text-[#a49cff]",
  },
  "Save for Later": {
    label: "Keep watching",
    tone: "text-[#b3bdd0]",
  },
  "Learn First": {
    label: "Skill sprint first",
    tone: "text-[#e5b96b]",
  },
  Skip: {
    label: "Low priority",
    tone: "text-[#ed8f9e]",
  },
};

function isPipelineStatus(decision: JobCardDecision): decision is PipelineStatus {
  return PIPELINE_STATUSES.includes(decision as PipelineStatus);
}

function statusMatches(decision: PipelineStatus, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "shortlist") return decision === "saved" || decision === "stretch";
  if (filter === "learning") return decision === "learn_first";
  if (filter === "applications") {
    return ["apply", "applied", "interview", "offer"].includes(decision);
  }
  return decision === "rejected" || decision === "archived";
}

function compareJobs(left: JobCardViewModel, right: JobCardViewModel, sort: SortKey) {
  if (sort === "fit") return right.deterministicFitScore - left.deterministicFitScore;
  if (sort === "career") return right.careerValueScore - left.careerValueScore;
  if (sort === "stretch") return left.stretchScore - right.stretchScore;
  if (sort === "salary") {
    return (right.annualSalaryEstimateCents ?? -1) - (left.annualSalaryEstimateCents ?? -1);
  }
  return left.company.localeCompare(right.company) || left.title.localeCompare(right.title);
}

function evidenceBackedOpportunity(job: JobCardViewModel) {
  const opportunity = job.decisionBrief?.opportunity.trim();
  const opportunitySegments = opportunity
    ?.split(/\s*·\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const isOnlyWorkMode =
    opportunitySegments &&
    opportunitySegments.length > 0 &&
    opportunitySegments.every((segment) =>
      /^(?:remote|hybrid|on[- ]site)\b.*\b(?:preferred|setup|arrangement)\b/i.test(
        segment,
      ),
    );

  return !opportunity || isOnlyWorkMode
    ? job.decisionBrief?.edge ?? job.strongestMatches[0] ?? job.reasonsToApply[0]
    : opportunity;
}

function decisionBrief(job: JobCardViewModel) {
  const cautionFirst =
    job.verdict === "Skip" ||
    job.verdict === "Learn First" ||
    job.readiness === "Not Yet Efficient";
  const primary = cautionFirst
    ? job.decisionBrief?.risk ?? job.biggestGaps[0] ?? job.reasonsNotToApply[0]
    : evidenceBackedOpportunity(job);

  return primary?.trim() || job.verdictExplanation.trim();
}

function displayLocation(job: JobCardViewModel) {
  const arrangement = job.workArrangement.toLocaleLowerCase("en-US");
  const locationParts = job.location
    .split(/\s*(?:·|—|\|)\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.toLocaleLowerCase("en-US") !== arrangement);
  const location = locationParts.join(" — ") || job.location;

  return job.workArrangement === "Unclear"
    ? location
    : `${location} · ${job.workArrangement}`;
}

function careerValueLabel(score: number) {
  if (score >= 7.5) return "High career upside";
  if (score >= 6) return "Solid career upside";
  if (score >= 4.5) return "Moderate career upside";
  return "Limited career upside";
}

function ComparisonPanel({
  jobs,
  onClear,
  onRemove,
}: {
  jobs: JobCardViewModel[];
  onClear: () => void;
  onRemove: (jobId: string) => void;
}) {
  if (jobs.length < 2) return null;

  return (
    <section
      className="glass-dark mb-4 overflow-hidden rounded-[1.25rem] text-white"
      aria-label="Job comparison"
    >
      <div className="flex items-center gap-2.5 border-b border-white/10 px-4 py-3.5 sm:px-5">
        <GitCompareArrows className="size-4 text-[#a9a4ff]" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Compare</h2>
        <span className="text-xs text-white/48">{jobs.length} roles</span>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-white/58 transition hover:bg-white/8 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
        >
          Clear
        </button>
      </div>
      <div className="overflow-x-auto overscroll-x-contain">
        <div
          className="grid min-w-max divide-x divide-white/10"
          style={{ gridTemplateColumns: `repeat(${jobs.length}, minmax(16rem, 1fr))` }}
        >
          {jobs.map((job) => {
            const disposition = DISPOSITION_META[job.verdict];
            return (
              <div key={job.id} className="relative p-4 sm:p-5">
                <button
                  type="button"
                  onClick={() => onRemove(job.id)}
                  aria-label={`Remove ${job.title} from comparison`}
                  className="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-white/8 text-white/55 transition hover:bg-white/14 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
                <p className="pr-12 text-xs font-medium text-white/52">{job.company}</p>
                <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold leading-5">
                  {job.title}
                </h3>
                <span className="mt-3 inline-flex text-[11px] font-medium text-white/70">
                  {disposition.label}
                </span>
                <dl className="mt-5 space-y-4 text-xs">
                  <div>
                    <dt className="text-white/42">Compensation</dt>
                    <dd className="mt-1 font-medium text-white/88">{job.salaryDisplay}</dd>
                  </div>
                  <div>
                    <dt className="text-white/42">Work</dt>
                    <dd className="mt-1 line-clamp-2 font-medium text-white/82">
                      {displayLocation(job)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/42">Readiness</dt>
                    <dd className="mt-1 font-medium text-white/82">{job.readiness}</dd>
                  </div>
                  <div>
                    <dt className="text-white/42">Trajectory</dt>
                    <dd className="mt-1 font-medium text-white/82">
                      {careerValueLabel(job.careerValueScore)}
                    </dd>
                  </div>
                  <div className="border-t border-white/10 pt-4">
                    <dt className="text-white/42">Best case</dt>
                    <dd className="mt-1 line-clamp-3 leading-5 text-white/76">
                      {evidenceBackedOpportunity(job)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/42">Main risk</dt>
                    <dd className="mt-1 line-clamp-3 leading-5 text-white/76">
                      {job.decisionBrief?.risk ??
                        job.biggestGaps[0] ??
                        job.reasonsNotToApply[0]}
                    </dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function SavedJobList({ initialJobs }: { initialJobs: JobCardViewModel[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [arrangement, setArrangement] = useState("all");
  const [sort, setSort] = useState<SortKey>("fit");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [noteEditor, setNoteEditor] = useState<{
    draft: string;
    jobId: string | null;
  }>({ draft: "", jobId: null });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noteInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (noteEditor.jobId) noteInputRef.current?.focus();
  }, [noteEditor.jobId]);

  const visibleJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return jobs
      .filter((job) => {
        if (!isPipelineStatus(job.currentDecision)) return false;
        if (!statusMatches(job.currentDecision, statusFilter)) return false;
        if (arrangement !== "all" && job.workArrangement !== arrangement) return false;
        if (!normalizedQuery) return true;
        return [job.title, job.company, job.location, ...job.technologies]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .toSorted((left, right) => compareJobs(left, right, sort));
  }, [arrangement, jobs, query, sort, statusFilter]);

  const comparedJobs = useMemo(
    () => compareIds.flatMap((id) => jobs.find((job) => job.id === id) ?? []),
    [compareIds, jobs],
  );

  const activeFilterCount =
    Number(statusFilter !== "all") +
    Number(arrangement !== "all") +
    Number(sort !== "fit");
  const showsResultContext =
    query.trim().length > 0 || activeFilterCount > 0 || compareIds.length > 0;

  function resetFilters() {
    setQuery("");
    setStatusFilter("all");
    setArrangement("all");
    setSort("fit");
  }

  function runJobAction(jobId: string, action: () => Promise<void>) {
    if (pending) return;
    setError(null);
    setMessage(null);
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        await action();
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "That change could not be saved.",
        );
      } finally {
        setPendingJobId(null);
      }
    });
  }

  function restore(jobId: string) {
    runJobAction(jobId, async () => {
      const expectedDecision = jobs.find((job) => job.id === jobId)?.currentDecision;
      if (!expectedDecision) throw new Error("This saved job is no longer available.");
      const result = await restoreJobToDeckAction(jobId, expectedDecision);
      if (!result.ok) throw new Error(result.message);
      setJobs((current) => current.filter((job) => job.id !== jobId));
      setCompareIds((current) => current.filter((id) => id !== jobId));
      setMessage("Returned to your active deck.");
      requestAnimationFrame(() => searchInputRef.current?.focus());
    });
  }

  function updateStatus(jobId: string, status: PipelineStatus) {
    runJobAction(jobId, async () => {
      const expectedDecision = jobs.find((job) => job.id === jobId)?.currentDecision;
      if (!expectedDecision) throw new Error("This saved job is no longer available.");
      const result = await updateJobStatusAction(jobId, status, expectedDecision);
      if (!result.ok) throw new Error(result.message);
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId ? { ...job, currentDecision: status } : job,
        ),
      );
      setMessage(`Status changed to ${STATUS_META[status].label.toLowerCase()}.`);
    });
  }

  function saveNote(jobId: string) {
    const submittedDraft = noteEditor.draft;
    const cleanNote = submittedDraft.trim();
    if (!cleanNote) return;
    runJobAction(jobId, async () => {
      const result = await addJobNoteAction(jobId, cleanNote);
      if (!result.ok) throw new Error(result.message);
      setNoteEditor((current) =>
        current.jobId === jobId && current.draft === submittedDraft
          ? { draft: "", jobId: null }
          : current,
      );
      setMessage("Note saved to this job's history.");
    });
  }

  function toggleCompare(jobId: string) {
    setError(null);
    setCompareIds((current) => {
      if (current.includes(jobId)) return current.filter((id) => id !== jobId);
      if (current.length >= 3) {
        setError("Compare up to three opportunities at a time.");
        return current;
      }
      return [...current, jobId];
    });
  }

  return (
    <div className="saved-workspace">
      <header className="mb-5 px-1 sm:mb-6">
        <div className="flex items-end justify-between gap-4">
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.04em] text-[#f6f8fc]">
          Saved
        </h1>
        <p className="pb-1 text-[12px] font-medium text-[#9ba6ba]">
          {jobs.length} saved {jobs.length === 1 ? "role" : "roles"}
        </p>
        </div>
      </header>

      {jobs.length === 0 ? (
        <section className="editorial-dark-surface mx-auto max-w-xl rounded-[1.25rem] px-6 py-14 text-center sm:py-18">
          <BookmarkCheck className="mx-auto size-5 text-[#9b92ff]" aria-hidden="true" />
          <h2 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-[#f5f7fb]">
            Nothing saved yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#9ba6ba]">
            Roles you keep will wait here for a closer look.
          </p>
          <Link href="/" className={cn(buttonVariants(), "mt-6 px-5")}>
            Browse jobs
          </Link>
        </section>
      ) : (
        <>
          <section
            className="editorial-dark-surface mb-5 rounded-[1.25rem] p-2.5"
            aria-label="Search and filter saved jobs"
          >
            <div className="flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search saved jobs</span>
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#8a94a5]"
                  aria-hidden="true"
                />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search saved roles"
                  className="h-11 w-full rounded-[0.9rem] border border-white/10 bg-white/[0.055] pl-10 pr-3 text-base text-[#f0f3fa] outline-none placeholder:text-[#6f7a90] focus:border-[#8176ff]/45 focus:ring-3 focus:ring-[#8176ff]/12 sm:text-sm"
                />
              </label>
              <button
                type="button"
                onClick={() => setFiltersOpen((current) => !current)}
                aria-expanded={filtersOpen}
                aria-controls="saved-job-filters"
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-2 rounded-[0.9rem] border border-white/10 bg-white/[0.055] px-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#8176ff]/22",
                  filtersOpen || activeFilterCount > 0
                    ? "border-[#8176ff]/35 bg-[#8176ff]/12 text-[#b3adff]"
                    : "text-[#a6b0c3] hover:bg-white/[0.09]",
                )}
              >
                <SlidersHorizontal className="size-4" aria-hidden="true" />
                <span className="hidden min-[360px]:inline">Filters</span>
                {activeFilterCount > 0 ? (
                  <span className="grid size-5 place-items-center rounded-full bg-[#8176ff] text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                ) : null}
              </button>
            </div>

            {filtersOpen ? (
              <div
                id="saved-job-filters"
                className="mt-2 grid gap-2 border-t border-white/[0.08] px-1 pb-1 pt-3 sm:grid-cols-3"
              >
                <label className="space-y-1.5">
                  <span className="px-1 text-xs font-medium text-[#8e99ae]">
                    Stage
                  </span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-[#111725] px-3 text-base font-medium text-[#e6eaf3] outline-none focus:ring-2 focus:ring-[#8176ff]/25 sm:text-sm"
                  >
                    <option value="all">All stages</option>
                    <option value="shortlist">Saved & stretch</option>
                    <option value="learning">Learn first</option>
                    <option value="applications">Applications</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="px-1 text-xs font-medium text-[#8e99ae]">
                    Work style
                  </span>
                  <select
                    value={arrangement}
                    onChange={(event) => setArrangement(event.target.value)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-[#111725] px-3 text-base font-medium text-[#e6eaf3] outline-none focus:ring-2 focus:ring-[#8176ff]/25 sm:text-sm"
                  >
                    <option value="all">Any work style</option>
                    <option value="Remote">Remote</option>
                    <option value="Hybrid">Hybrid</option>
                    <option value="On-site">On-site</option>
                    <option value="Unclear">Unclear</option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="px-1 text-xs font-medium text-[#8e99ae]">
                    Order
                  </span>
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                    className="h-11 w-full rounded-xl border border-white/10 bg-[#111725] px-3 text-base font-medium text-[#e6eaf3] outline-none focus:ring-2 focus:ring-[#8176ff]/25 sm:text-sm"
                  >
                    <option value="fit">Recommended</option>
                    <option value="career">Career value</option>
                    <option value="salary">Highest salary</option>
                    <option value="stretch">Most realistic</option>
                    <option value="company">Company</option>
                  </select>
                </label>
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="justify-self-start rounded-lg px-2 py-1 text-xs font-semibold text-[#aaa3ff] hover:bg-white/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/30 sm:col-span-3"
                  >
                    Reset filters
                  </button>
                ) : null}
              </div>
            ) : null}
          </section>

          {error ? (
            <p
              role="alert"
              className="mb-4 rounded-xl border border-[#ed8f9e]/20 bg-[#ed8f9e]/10 px-4 py-3 text-sm text-[#f1a8b4]"
            >
              {error}
            </p>
          ) : null}
          {message ? (
            <p
              role="status"
              className="mb-4 rounded-xl border border-[#65d7aa]/18 bg-[#65d7aa]/10 px-4 py-3 text-sm text-[#82ddb9]"
            >
              {message}
            </p>
          ) : null}

          <ComparisonPanel
            jobs={comparedJobs}
            onClear={() => setCompareIds([])}
            onRemove={(jobId) =>
              setCompareIds((current) => current.filter((id) => id !== jobId))
            }
          />

          {showsResultContext ? (
            <div className="mb-3 flex min-h-6 items-center justify-between px-1 text-xs text-[#8f9aae]">
              <span>
                {visibleJobs.length}{" "}
                {visibleJobs.length === 1 ? "opportunity" : "opportunities"}
              </span>
              {compareIds.length > 0 ? (
                <span>
                  {compareIds.length}/3 selected
                  {compareIds.length === 1 ? " · choose one more" : ""}
                </span>
              ) : null}
            </div>
          ) : null}

          {visibleJobs.length === 0 ? (
            <section className="editorial-dark-surface rounded-[1.25rem] px-6 py-14 text-center">
              <p className="text-sm font-semibold text-[#f0f3f9]">
                No saved roles match.
              </p>
              <button
                type="button"
                className="mt-3 rounded-lg px-2 py-1 text-sm font-semibold text-[#aaa3ff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/30"
                onClick={resetFilters}
              >
                Clear search and filters
              </button>
            </section>
          ) : (
            <div className="editorial-dark-surface overflow-hidden rounded-[1.35rem]">
              {visibleJobs.map((job) => {
                const visual = companyVisual(job.company);
                const status = isPipelineStatus(job.currentDecision)
                  ? job.currentDecision
                  : "saved";
                const selected = compareIds.includes(job.id);
                const insight = decisionBrief(job);

                return (
                  <article
                    key={job.id}
                    className="saved-job-listing relative overflow-hidden border-b border-white/[0.09] bg-transparent transition-[background-color] duration-200 last:border-b-0 hover:bg-white/[0.035]"
                  >
                    <div className="flex min-h-[6.75rem] items-center gap-3.5 px-4 py-3.5 pr-14 sm:px-5 sm:pr-16">
                      <div
                        aria-hidden="true"
                        className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[0.85rem] border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_8px_20px_rgba(0,0,0,.18)]"
                        style={{ backgroundColor: visual.background, color: visual.foreground }}
                      >
                        <CompanyMark compact company={job.company} className="max-h-5 max-w-7" />
                      </div>
                      <Link
                        href={`/jobs/${job.id}`}
                        aria-label={`Open ${job.title} at ${job.company}`}
                        className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/50"
                      >
                        <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-[#929db2]">
                          <span className="truncate">{job.company}</span>
                          <span className="size-1 shrink-0 rounded-full bg-white/25" aria-hidden="true" />
                          <span className="shrink-0 text-[#aaa3ff]">{STATUS_META[status].label}</span>
                        </p>
                        <h2 className="mt-0.5 truncate text-[1rem] font-semibold leading-5 tracking-[-0.02em] text-[#f4f6fb]">
                          {job.title}
                        </h2>
                        <p className="mt-1 truncate text-[12px] text-[#9da8bb]">
                          <span className="font-semibold text-[#dfe4ed]">{job.salaryDisplay}</span>
                          <span className="mx-1.5 text-white/25" aria-hidden="true">·</span>
                          {displayLocation(job)}
                        </p>
                      </Link>
                    </div>

                    <details className="group bg-black/[0.08]">
                      <summary
                        className="absolute right-2.5 top-3 grid size-11 cursor-pointer list-none place-items-center rounded-xl text-[#8f9aae] outline-none transition hover:bg-white/[0.06] hover:text-white focus-visible:ring-2 focus-visible:ring-[#8176ff]/35 [&::-webkit-details-marker]:hidden sm:right-4"
                        aria-label={`More options for ${job.title}`}
                      >
                        <MoreHorizontal className="size-4" aria-hidden="true" />
                      </summary>
                      <div className="space-y-3 border-t border-white/[0.07] px-4 pb-4 pt-3 sm:px-5">
                        <p className="border-l border-[#8176ff]/45 pl-3 text-[12px] leading-5 text-[#aab4c6]">
                          {insight}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="relative min-w-36 flex-1">
                            <span className="sr-only">Pipeline stage for {job.title}</span>
                            <select
                              value={status}
                              onChange={(event) => updateStatus(job.id, event.target.value as PipelineStatus)}
                              disabled={pending}
                              className="h-11 w-full appearance-none rounded-xl border border-white/10 bg-white/[0.05] py-0 pl-3 pr-8 text-[12px] font-semibold text-[#c4ccda] outline-none focus:border-[#8176ff]/40 focus:ring-2 focus:ring-[#8176ff]/20 disabled:opacity-50"
                            >
                              {PIPELINE_STATUSES.map((value) => (
                                <option key={value} value={value}>{STATUS_META[value].label}</option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-3.5 -translate-y-1/2 text-[#8f9aae]" aria-hidden="true" />
                          </label>
                          {job.sourceUrl ? (
                          <a
                            href={job.sourceUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`Apply to ${job.title} at ${job.company} (opens in a new tab)`}
                            aria-disabled={pending}
                            tabIndex={pending ? -1 : undefined}
                            onClick={(event) => {
                              if (pending) {
                                event.preventDefault();
                                return;
                              }
                              if (!["applied", "interview", "offer"].includes(status)) {
                                updateStatus(job.id, "apply");
                              }
                            }}
                            className={cn(
                              buttonVariants({ size: "lg" }),
                              "h-11 rounded-xl bg-[#f4f6fb] px-4 text-sm text-[#101726] hover:bg-white",
                              pending && "pointer-events-none opacity-45",
                            )}
                          >
                            Apply
                            <ArrowUpRight data-icon="inline-end" />
                          </a>
                        ) : null}
                      </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => toggleCompare(job.id)}
                            aria-pressed={selected}
                            className={cn(
                              "h-11 border-white/10 bg-white/[0.05] text-[#aab4c6] hover:bg-white/[0.09] hover:text-white",
                              selected && "border-[#8176ff]/30 bg-[#8176ff]/12 text-[#b6afff]",
                            )}
                          >
                            {selected ? (
                              <Check data-icon="inline-start" />
                            ) : (
                              <GitCompareArrows data-icon="inline-start" />
                            )}
                            Compare
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setNoteEditor((current) =>
                                current.jobId === job.id
                                  ? { draft: "", jobId: null }
                                  : { draft: "", jobId: job.id },
                              )
                            }
                            aria-expanded={noteEditor.jobId === job.id}
                            className="h-11 border-white/10 bg-white/[0.05] text-[#aab4c6] hover:bg-white/[0.09] hover:text-white"
                          >
                            <StickyNote data-icon="inline-start" />
                            Note
                          </Button>
                          {status !== "rejected" && status !== "offer" ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => restore(job.id)}
                              disabled={pending}
                              className="h-11 border-white/10 bg-white/[0.05] text-[#aab4c6] hover:bg-white/[0.09] hover:text-white"
                            >
                              {pendingJobId === job.id ? (
                                <LoaderCircle
                                  className="animate-spin"
                                  data-icon="inline-start"
                                />
                              ) : (
                                <RotateCcw data-icon="inline-start" />
                              )}
                              Return to feed
                            </Button>
                          ) : null}
                        </div>

                        {noteEditor.jobId === job.id ? (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <label className="min-w-0 flex-1">
                              <span className="sr-only">Add a note about {job.title}</span>
                              <input
                                ref={noteInputRef}
                                value={noteEditor.draft}
                                onChange={(event) => {
                                  const draft = event.target.value;
                                  setNoteEditor((current) =>
                                    current.jobId === job.id
                                      ? { ...current, draft }
                                      : current,
                                  );
                                }}
                                maxLength={2_000}
                                placeholder="Why is this worth pursuing?"
                                className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.05] px-3 text-base text-[#edf0f6] outline-none placeholder:text-[#727e92] focus:ring-2 focus:ring-[#8176ff]/25 sm:text-sm"
                              />
                            </label>
                            <Button
                              type="button"
                              size="sm"
                              className="h-11 px-4"
                              disabled={pending || noteEditor.draft.trim().length === 0}
                              onClick={() => saveNote(job.id)}
                            >
                              {pendingJobId === job.id ? (
                                <LoaderCircle className="animate-spin" />
                              ) : (
                                "Save note"
                              )}
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </details>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
