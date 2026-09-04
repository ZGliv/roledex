"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Heart,
  Pencil,
  Search,
} from "lucide-react";
import { CompanyMark } from "./company-mark";
import { companyVisual } from "./company-visual";
import {
  emergencySavedJobs,
  EMERGENCY_DECISIONS_CHANGED_EVENT,
} from "../emergency-feed-storage";
import { readJobFeedSnapshot, type CachedJobSummary } from "../feed-snapshot";
import {
  applicationPipeline,
  APPLICATIONS_CHANGED_EVENT,
  APPLICATION_STAGES,
  readTrackedApplications,
  saveTrackedApplication,
  type ApplicationStage,
  type TrackedApplication,
} from "../application-tracker-storage";

const labels: Record<ApplicationStage, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  archived: "Archived",
};
const EMPTY_SAVED: CachedJobSummary[] = [];

function ApplicationRow({
  entry,
  onChange,
}: {
  entry: TrackedApplication;
  onChange: (changes: { stage?: ApplicationStage; note?: string }) => boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(entry.note);
  const { job } = entry;
  const visual = companyVisual(job.company);
  return (
    <article className="relative overflow-hidden rounded-[1.5rem] border border-white/[0.11] bg-[#0c1322]/90 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.07),0_14px_40px_rgba(0,0,0,.2)] sm:p-5">
      <div className="flex items-start gap-3">
        <span
          className="grid size-12 shrink-0 place-items-center rounded-2xl border border-white/20 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,.22)]"
          style={{ background: visual.background, color: visual.foreground }}
        >
          <CompanyMark
            company={job.company}
            compact
            className="max-h-7 max-w-8"
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-[#a2adc1]">
            {job.company}
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold leading-tight tracking-[-0.025em] text-white">
            {job.title}
          </h2>
          <p className="mt-3 text-sm font-medium text-[#dfe4f0]">
            {job.salaryDisplay}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#8d99af]">
            {job.location} · {job.workArrangement}
          </p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 border-t border-white/[0.07] pt-4">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">
            Stage for {job.title} at {job.company}
          </span>
          <select
            value={entry.stage}
            onChange={(event) =>
              onChange({ stage: event.target.value as ApplicationStage })
            }
            className="h-11 w-full appearance-none rounded-xl border border-[#a89fff]/25 bg-[#8176ff]/10 pl-3 pr-8 text-sm font-medium text-[#d0caff] outline-none focus-visible:ring-2 focus-visible:ring-[#a89fff]"
          >
            {APPLICATION_STAGES.map((stage) => (
              <option value={stage} key={stage}>
                {labels[stage]}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-3.5 size-4 text-[#b0a8ee]"
            aria-hidden="true"
          />
        </label>
        <button
          type="button"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 text-[#b8c2d2] outline-none focus-visible:ring-2 focus-visible:ring-[#a89fff]"
          aria-label={`Edit note for ${job.title}`}
          onClick={() => {
            setNote(entry.note);
            setEditing(!editing);
          }}
        >
          <Pencil className="size-4" aria-hidden="true" />
        </button>
        {job.sourceUrl ? (
          <a
            href={job.sourceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-[#8176ff] px-4 text-xs font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[#d0caff]"
          >
            Listing <ArrowUpRight className="size-4" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      {!editing && entry.note ? (
        <p className="mt-4 whitespace-pre-wrap break-words border-l-2 border-[#8176ff]/45 pl-3 text-sm leading-6 text-[#aab5ca]">
          {entry.note}
        </p>
      ) : null}
      {editing ? (
        <form
          className="mt-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (onChange({ note: note.trim() })) setEditing(false);
          }}
        >
          <label className="block text-xs font-medium text-[#b3bdd1]">
            Private note
            <textarea
              autoFocus
              maxLength={2000}
              rows={3}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-2 block w-full resize-y rounded-xl border border-white/15 bg-[#070b14] p-3 text-base leading-6 text-white outline-none focus:border-[#aaa3ff]"
            />
          </label>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-11 px-4 text-xs text-[#a1acc1]"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 text-xs font-semibold text-white"
            >
              <Check className="size-4" aria-hidden="true" />
              Save note
            </button>
          </div>
        </form>
      ) : null}
    </article>
  );
}

export function ApplicationTracker({
  initialSaved = EMPTY_SAVED,
}: {
  initialSaved?: CachedJobSummary[];
}) {
  const [entries, setEntries] = useState<TrackedApplication[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<"all" | ApplicationStage>("all");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const update = () => {
      const snapshot = readJobFeedSnapshot("saved");
      const saved = [
        ...initialSaved,
        ...(snapshot?.kind === "saved" ? snapshot.jobs : []),
        ...emergencySavedJobs(),
      ];
      setEntries(applicationPipeline(saved, readTrackedApplications()));
      setLoaded(true);
    };
    const frame = requestAnimationFrame(update);
    window.addEventListener("storage", update);
    window.addEventListener(EMERGENCY_DECISIONS_CHANGED_EVENT, update);
    window.addEventListener(APPLICATIONS_CHANGED_EVENT, update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("storage", update);
      window.removeEventListener(EMERGENCY_DECISIONS_CHANGED_EVENT, update);
      window.removeEventListener(APPLICATIONS_CHANGED_EVENT, update);
    };
  }, [initialSaved]);
  const visible = useMemo(
    () =>
      entries.filter(
        (entry) =>
          (filter === "all"
            ? entry.stage !== "archived"
            : entry.stage === filter) &&
          `${entry.job.company} ${entry.job.title} ${entry.job.location} ${entry.note}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [entries, filter, query],
  );
  return (
    <div className="app-viewport role-workspace-page job-deck-bg px-4 pt-[max(1.25rem,env(safe-area-inset-top))] text-white">
      <div className="mx-auto max-w-2xl pb-8">
        <header className="flex items-end justify-between py-3">
          <div>
            <p className="text-xs font-medium text-[#9990de]">RoleDex</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-[-0.045em]">
              Applications
            </h1>
          </div>
          <BriefcaseBusiness
            className="mb-1 size-6 text-[#a69dee]"
            aria-hidden="true"
          />
        </header>
        <div
          className="mt-4 grid grid-cols-3 gap-2"
          aria-label="Application summary"
        >
          {(["saved", "applied", "interview"] as const).map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => setFilter(filter === stage ? "all" : stage)}
              aria-pressed={filter === stage}
              className="rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-4 text-left outline-none transition-colors aria-pressed:border-[#a99fff]/50 aria-pressed:bg-[#8176ff]/10 focus-visible:ring-2 focus-visible:ring-[#a99fff]"
            >
              <span className="block font-display text-2xl font-semibold tabular-nums">
                {entries.filter((entry) => entry.stage === stage).length}
              </span>
              <span className="mt-1 block text-xs text-[#9da8be]">
                {labels[stage]}
              </span>
            </button>
          ))}
        </div>
        <label className="relative mt-5 block">
          <span className="sr-only">Search applications</span>
          <Search
            className="absolute left-3.5 top-3.5 size-4 text-[#8995ac]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search applications"
            className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.035] pl-10 pr-4 text-base outline-none placeholder:text-[#6c7891] focus:border-[#a99fff]/60"
          />
        </label>
        <div
          className="mt-3 flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]"
          aria-label="Filter applications"
        >
          {(["all", ...APPLICATION_STAGES] as const).map((stage) => (
            <button
              key={stage}
              type="button"
              aria-pressed={filter === stage}
              onClick={() => setFilter(stage)}
              className="min-h-11 shrink-0 rounded-full border border-transparent px-3.5 text-xs font-medium text-[#94a0b6] outline-none aria-pressed:border-white/15 aria-pressed:bg-white/[0.08] aria-pressed:text-white focus-visible:ring-2 focus-visible:ring-[#a99fff]"
            >
              {stage === "all" ? "Active" : labels[stage]}
            </button>
          ))}
        </div>
        {status ? (
          <p
            role="status"
            className="mt-3 rounded-xl bg-white/5 p-3 text-xs text-[#c9c1ff]"
          >
            {status}
          </p>
        ) : null}
        {!loaded ? (
          <div
            className="py-20 text-center"
            role="status"
            aria-label="Loading applications"
          >
            <span className="page-loading-spinner" />
          </div>
        ) : visible.length ? (
          <div className="mt-3 space-y-3">
            {visible.map((entry) => (
              <ApplicationRow
                key={entry.job.id}
                entry={entry}
                onChange={(changes) => {
                  if (!saveTrackedApplication(entry.job, changes)) {
                    setStatus(
                      "Couldn’t save your change. Free some browser storage and try again.",
                    );
                    return false;
                  }
                  setStatus(
                    changes.stage
                      ? `Moved to ${labels[changes.stage].toLowerCase()}.`
                      : "Note saved.",
                  );
                  return true;
                }}
              />
            ))}
          </div>
        ) : (
          <section className="py-14 text-center">
            <Heart
              className="mx-auto size-7 text-[#a49bf0]"
              aria-hidden="true"
            />
            <h2 className="mt-4 font-display text-xl font-semibold">
              {entries.length
                ? "No matching applications"
                : "Your next move starts with a save"}
            </h2>
            <Link
              href="/"
              className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[#111827]"
            >
              Discover roles{" "}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
