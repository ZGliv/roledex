"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ArrowUpRight,
  Archive,
  Check,
  ChevronDown,
  LoaderCircle,
  Search,
  StickyNote,
  Trash2,
} from "lucide-react";

import { CompanyMark } from "@/features/jobs/components/company-mark";
import { companyVisual } from "@/features/jobs/components/company-visual";
import type { JobCardViewModel } from "@/features/jobs/components/job-card";
import {
  addJobNoteAction,
  restoreJobToDeckAction,
  updateJobStatusAction,
} from "@/features/jobs/actions";
import { saveJobFeedSnapshot } from "@/features/jobs/feed-snapshot";

type Filter = "active" | "remote" | "hybrid" | "on_site" | "applied" | "archived";
type Sort = "recommended" | "salary" | "newest" | "company";

const filters: readonly { label: string; value: Filter }[] = [
  { label: "Saved", value: "active" },
  { label: "Remote", value: "remote" },
  { label: "Hybrid", value: "hybrid" },
  { label: "On-site", value: "on_site" },
  { label: "Applied", value: "applied" },
  { label: "Archived", value: "archived" },
];

const sorts: readonly { label: string; value: Sort }[] = [
  { label: "Recommended", value: "recommended" },
  { label: "Highest pay", value: "salary" },
  { label: "Newest", value: "newest" },
  { label: "Company A–Z", value: "company" },
];

function isApplied(job: JobCardViewModel) {
  return ["applied", "interview", "offer", "rejected"].includes(
    job.currentDecision,
  );
}

const advancedApplicationStages = ["interview", "offer", "rejected"] as const;

export function savedApplicationControl(decision: string) {
  if (decision === "interview") return { label: "Interview", next: null } as const;
  if (decision === "offer") return { label: "Offer", next: null } as const;
  if (decision === "rejected") return { label: "Closed", next: null } as const;
  if (decision === "applied") return { label: "Applied", next: "saved" } as const;
  return { label: "Mark applied", next: "applied" } as const;
}

function isVisibleForFilter(job: JobCardViewModel, filter: Filter) {
  if (filter === "archived") return job.currentDecision === "archived";
  if (job.currentDecision === "archived") return false;
  if (filter === "active") return true;
  if (filter === "applied") return isApplied(job);
  return job.workArrangement.toLocaleLowerCase("en-US").replace("-", "_") === filter;
}

function dateValue(value: string | null) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortJobs(jobs: readonly JobCardViewModel[], sort: Sort) {
  return jobs.toSorted((left, right) => {
    if (sort === "salary") {
      return (
        (right.annualSalaryEstimateCents ?? -1) -
        (left.annualSalaryEstimateCents ?? -1)
      );
    }
    if (sort === "newest") return dateValue(right.datePosted) - dateValue(left.datePosted);
    if (sort === "company") {
      return left.company.localeCompare(right.company) || left.title.localeCompare(right.title);
    }
    return right.personalizationScore - left.personalizationScore;
  });
}

export function SavedShortlist({
  initialJobs,
}: {
  initialJobs: readonly JobCardViewModel[];
}) {
  const [jobs, setJobs] = useState([...initialJobs]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("active");
  const [sort, setSort] = useState<Sort>("recommended");
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const noteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => saveJobFeedSnapshot("saved", jobs), [jobs]);
  useEffect(() => {
    if (expandedNoteId) noteRef.current?.focus();
  }, [expandedNoteId]);

  const visibleJobs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en-US");
    return sortJobs(
      jobs.filter((job) => {
        if (!isVisibleForFilter(job, filter)) return false;
        if (!normalizedQuery) return true;
        return [job.title, job.company, job.location, job.workArrangement]
          .join(" ")
          .toLocaleLowerCase("en-US")
          .includes(normalizedQuery);
      }),
      sort,
    );
  }, [filter, jobs, query, sort]);

  function run(jobId: string, operation: () => Promise<void>) {
    setError(null);
    setMessage(null);
    setPendingJobId(jobId);
    startTransition(async () => {
      try {
        await operation();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "That change could not be saved.");
      } finally {
        setPendingJobId(null);
      }
    });
  }

  function changeStatus(job: JobCardViewModel, status: "saved" | "applied" | "archived") {
    run(job.id, async () => {
      const result = await updateJobStatusAction(
        job.id,
        status,
        job.currentDecision,
        job.currentDecisionEventId,
      );
      if (!result.ok) throw new Error(result.message);
      setJobs((current) =>
        current.map((candidate) =>
          candidate.id === job.id
            ? {
                ...candidate,
                currentDecision: status,
                currentDecisionEventId: result.value.decisionEventId,
              }
            : candidate,
        ),
      );
      setMessage(
        status === "archived"
          ? "Archived."
          : status === "applied"
            ? "Marked as applied."
            : "Moved back to Saved.",
      );
    });
  }

  function remove(job: JobCardViewModel) {
    run(job.id, async () => {
      const result = await restoreJobToDeckAction(
        job.id,
        job.currentDecision,
        job.currentDecisionEventId,
      );
      if (!result.ok) throw new Error(result.message);
      setJobs((current) => current.filter((candidate) => candidate.id !== job.id));
      setMessage("Removed from Saved and returned to For You.");
    });
  }

  function saveNote(job: JobCardViewModel) {
    const cleanNote = note.trim();
    if (!cleanNote) return;
    run(job.id, async () => {
      const result = await addJobNoteAction(job.id, cleanNote);
      if (!result.ok) throw new Error(result.message);
      setNote("");
      setExpandedNoteId(null);
      setMessage("Private note saved.");
    });
  }

  return (
    <main className="saved-shortlist mx-auto w-full max-w-2xl pb-28">
      <header className="mb-5 px-1 pt-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[1.75rem] font-semibold tracking-[-0.045em] text-[#f6f8fc]">
              Saved
            </h1>
            <p className="mt-1 text-[13px] text-[#8f9bb0]">
              Your shortlist, kept intentionally simple.
            </p>
          </div>
          <span className="pb-1 text-[12px] font-medium tabular-nums text-[#8f9bb0]">
            {jobs.filter((job) => job.currentDecision !== "archived").length}
          </span>
        </div>
      </header>

      <section
        aria-label="Search and filter saved jobs"
        className="mb-4 rounded-[1.3rem] border border-white/[0.1] bg-[#0d1320]/82 p-2 shadow-[0_16px_50px_rgba(0,0,0,.18)] backdrop-blur-xl"
      >
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#7f8ba0]" aria-hidden="true" />
          <span className="sr-only">Search saved jobs</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, company, or location"
            className="h-12 w-full rounded-[0.95rem] border border-white/[0.09] bg-white/[0.045] pl-10 pr-4 text-base text-[#f1f4f9] outline-none placeholder:text-[#68758a] focus:border-[#8f85ff]/45 focus:ring-2 focus:ring-[#8176ff]/18"
          />
        </label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="relative">
            <span className="sr-only">Filter saved jobs</span>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as Filter)}
              className="h-11 w-full appearance-none rounded-[0.85rem] border border-white/[0.08] bg-white/[0.04] pl-3 pr-9 text-[13px] font-medium text-[#d7ddea] outline-none focus:border-[#8f85ff]/45 focus:ring-2 focus:ring-[#8176ff]/18"
            >
              {filters.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#7f8ba0]" aria-hidden="true" />
          </label>
          <label className="relative">
            <span className="sr-only">Sort saved jobs</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="h-11 w-full appearance-none rounded-[0.85rem] border border-white/[0.08] bg-white/[0.04] pl-3 pr-9 text-[13px] font-medium text-[#d7ddea] outline-none focus:border-[#8f85ff]/45 focus:ring-2 focus:ring-[#8176ff]/18"
            >
              {sorts.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-[#7f8ba0]" aria-hidden="true" />
          </label>
        </div>
      </section>

      <div className="min-h-6 px-1" role="status" aria-live="polite">
        {error ? <p className="text-[13px] text-[#ef9daa]">{error}</p> : null}
        {!error && message ? <p className="text-[13px] text-[#75dbb4]">{message}</p> : null}
      </div>

      {visibleJobs.length === 0 ? (
        <section className="mt-3 rounded-[1.25rem] border border-white/[0.09] bg-[#0c121e]/75 px-6 py-12 text-center">
          <p className="text-[15px] font-semibold text-[#edf1f7]">Nothing here yet.</p>
          <p className="mt-2 text-[13px] leading-5 text-[#8f9bb0]">
            Save a role from For You, or change this search filter.
          </p>
          <Link href="/" className="mt-5 inline-flex h-11 items-center rounded-full border border-white/[0.12] px-5 text-sm font-semibold text-[#eef1f7]">
            Open For You
          </Link>
        </section>
      ) : (
        <section className="mt-3 overflow-hidden rounded-[1.3rem] border border-white/[0.09] bg-[#0b111c]/82 shadow-[0_20px_70px_rgba(0,0,0,.22)]">
          {visibleJobs.map((job) => {
            const visual = companyVisual(job.company);
            const loading = pending && pendingJobId === job.id;
            const applicationControl = savedApplicationControl(job.currentDecision);
            const advancedApplicationStage = advancedApplicationStages.includes(
              job.currentDecision as (typeof advancedApplicationStages)[number],
            );
            return (
              <article key={job.id} className="border-b border-white/[0.08] last:border-b-0">
                <div className="flex gap-3.5 px-4 py-4 sm:px-5">
                  <div
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-[0.85rem] border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,.16),0_8px_20px_rgba(0,0,0,.18)]"
                    style={{ backgroundColor: visual.background, color: visual.foreground }}
                  >
                    <CompanyMark compact company={job.company} className="max-h-5 max-w-7" />
                  </div>
                  <Link href={`/jobs/${job.id}`} className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/45">
                    <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f9bb0]">{job.company}</p>
                    <h2 className="mt-1 text-[16px] font-semibold leading-5 tracking-[-0.025em] text-[#f1f4f9]">{job.title}</h2>
                    <p className="mt-1.5 line-clamp-1 text-[12px] text-[#9ba6b9]">
                      <span className="font-semibold text-[#dfe4ed]">{job.salaryDisplay}</span>
                      <span className="mx-1.5 text-white/25" aria-hidden="true">·</span>
                      {job.location} · {job.workArrangement}
                    </p>
                  </Link>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.06] bg-white/[0.018] px-4 py-3 sm:px-5">
                  {advancedApplicationStage ? (
                    <span
                      className="inline-flex h-11 items-center gap-2 rounded-full border border-[#75dbb4]/20 bg-[#75dbb4]/[0.07] px-4 text-[13px] font-semibold text-[#a9e9cf]"
                      title="Advanced application stages are preserved here."
                    >
                      <Check className="size-4" aria-hidden="true" />
                      {applicationControl.label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        if (applicationControl.next) {
                          changeStatus(job, applicationControl.next);
                        }
                      }}
                      className="inline-flex h-11 items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.045] px-4 text-[13px] font-semibold text-[#d9dfeb] outline-none hover:bg-white/[0.075] focus-visible:ring-2 focus-visible:ring-[#8176ff]/35 disabled:opacity-45"
                    >
                      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
                      {applicationControl.label}
                    </button>
                  )}
                  {job.sourceUrl ? (
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex h-11 items-center gap-2 rounded-full bg-[#eef1f7] px-4 text-[13px] font-semibold text-[#111827] outline-none hover:bg-white focus-visible:ring-2 focus-visible:ring-[#8176ff]/40"
                    >
                      Original <ArrowUpRight className="size-4" aria-hidden="true" />
                    </a>
                  ) : null}
                  <details className="relative ml-auto">
                    <summary className="grid size-11 cursor-pointer list-none place-items-center rounded-full border border-white/[0.09] text-[#9aa5b8] outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#8176ff]/35 [&::-webkit-details-marker]:hidden" aria-label={`More actions for ${job.title}`}>
                      <ChevronDown className="size-4" aria-hidden="true" />
                    </summary>
                    <div className="absolute bottom-12 right-0 z-20 w-52 overflow-hidden rounded-[1rem] border border-white/[0.12] bg-[#111827] p-1.5 shadow-2xl">
                      <button type="button" onClick={() => { setExpandedNoteId(job.id); setNote(""); }} className="flex h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-[13px] font-medium text-[#dce2ec] hover:bg-white/[0.07]"><StickyNote className="size-4" aria-hidden="true" /> Add private note</button>
                      <button type="button" onClick={() => changeStatus(job, "archived")} className="flex h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-[13px] font-medium text-[#dce2ec] hover:bg-white/[0.07]"><Archive className="size-4" aria-hidden="true" /> Archive</button>
                      <button type="button" onClick={() => remove(job)} className="flex h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-[13px] font-medium text-[#ef9daa] hover:bg-white/[0.07]"><Trash2 className="size-4" aria-hidden="true" /> Remove</button>
                    </div>
                  </details>
                </div>

                {expandedNoteId === job.id ? (
                  <div className="border-t border-white/[0.06] px-4 py-3 sm:px-5">
                    <label className="text-[12px] font-semibold text-[#b7c0cf]" htmlFor={`note-${job.id}`}>Private note</label>
                    <textarea
                      ref={noteRef}
                      id={`note-${job.id}`}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      maxLength={2_000}
                      rows={3}
                      placeholder="Why is this worth returning to?"
                      className="mt-2 w-full resize-none rounded-[0.9rem] border border-white/[0.1] bg-white/[0.04] px-3.5 py-3 text-base leading-6 text-[#edf1f7] outline-none placeholder:text-[#667389] focus:border-[#8176ff]/45 focus:ring-2 focus:ring-[#8176ff]/18"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <button type="button" onClick={() => { setExpandedNoteId(null); setNote(""); }} className="h-11 rounded-full px-4 text-[13px] font-semibold text-[#9aa5b8]">Cancel</button>
                      <button type="button" disabled={!note.trim() || loading} onClick={() => saveNote(job)} className="h-11 rounded-full bg-[#eceff6] px-5 text-[13px] font-semibold text-[#111827] disabled:opacity-45">Save note</button>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
