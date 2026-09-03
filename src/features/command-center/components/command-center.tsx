"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  ChevronDown,
  FileCheck2,
  FileText,
  FolderOpen,
  Search,
} from "lucide-react";

import {
  allWorkspaceArtifacts,
  opportunities,
  resumes,
  type Opportunity,
} from "@/features/command-center/data";

type ApplicationStage = "not_started" | "reviewing" | "ready" | "applied" | "interview" | "closed";
type View = "pipeline" | "resumes" | "files";

const STORAGE_KEY = "jobswipe-command-center-stages-v1";

const stageOptions: readonly { label: string; value: ApplicationStage }[] = [
  { label: "Not started", value: "not_started" },
  { label: "Reviewing", value: "reviewing" },
  { label: "Ready to apply", value: "ready" },
  { label: "Applied", value: "applied" },
  { label: "Interview", value: "interview" },
  { label: "Closed", value: "closed" },
];

const initialStages = Object.fromEntries(
  opportunities.map((job) => [job.id, job.liveStatus === "closed" ? "closed" : "not_started"]),
) as Record<string, ApplicationStage>;

function fileHref(id: string) {
  return `/api/command-center/files/${encodeURIComponent(id)}`;
}

function stageTone(stage: ApplicationStage) {
  if (stage === "applied" || stage === "interview") return "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-100";
  if (stage === "ready") return "border-[#4f7fd8] bg-[#203658] text-[#bcd0f5]";
  if (stage === "closed") return "border-white/10 bg-white/[0.04] text-white/45";
  return "border-amber-200/15 bg-amber-200/[0.06] text-amber-100";
}

function OpportunityCard({
  job,
  stage,
  onStageChange,
}: {
  job: Opportunity;
  stage: ApplicationStage;
  onStageChange: (stage: ApplicationStage) => void;
}) {
  const packetFiles = allWorkspaceArtifacts.filter((artifact) => job.packetIds.includes(artifact.id));

  return (
    <article className="rounded-2xl border border-[#2b3542] bg-[#151d27] p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[#b8c1cc]">
              {job.company}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${job.liveStatus === "live" ? "border-emerald-300/20 bg-emerald-300/[0.08] text-emerald-200" : "border-white/10 bg-white/[0.04] text-white/45"}`}>
              {job.verifiedLabel}
            </span>
          </div>
          <h2 className="mt-1.5 text-[17px] font-semibold leading-5 tracking-[-0.025em] text-[#f5f7fb]">
            {job.role}
          </h2>
          <p className="mt-2 text-[12px] text-[#9aa6ba]">
            <span className="font-semibold text-[#dce3ef]">{job.salary}</span>
            <span className="mx-1.5 text-white/20">·</span>
            {job.location}
          </p>
        </div>

        <label className="relative shrink-0">
          <span className="sr-only">Application stage for {job.company}</span>
          <select
            value={stage}
            onChange={(event) => onStageChange(event.target.value as ApplicationStage)}
            className={`h-9 appearance-none rounded-lg border py-0 pl-3 pr-8 text-[11px] font-semibold outline-none focus:ring-2 focus:ring-[#6f9bea] ${stageTone(stage)}`}
          >
            {stageOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 opacity-60" aria-hidden="true" />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#4f7fd8] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[#6693e2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8caef0]"
        >
          Open listing <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
        {job.resumeId ? (
          <a href={fileHref(job.resumeId)} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#303b49] bg-[#18212c] px-4 text-[12px] font-semibold text-[#e8edf5] hover:bg-[#202b38]">
            <FileText className="size-3.5" aria-hidden="true" /> Résumé
          </a>
        ) : null}
        {job.id === "foundant-aic" ? (
          <a href={fileHref("review-foundant")} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#303b49] bg-[#18212c] px-4 text-[12px] font-semibold text-[#e8edf5] hover:bg-[#202b38]">
            <FileCheck2 className="size-3.5" aria-hidden="true" /> 5-minute review
          </a>
        ) : null}
        {packetFiles.length ? (
          <details className="group relative">
            <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg border border-[#303b49] bg-[#18212c] px-4 text-[12px] font-semibold text-[#e8edf5] hover:bg-[#202b38]">
              <FolderOpen className="size-3.5" aria-hidden="true" /> Packet ({packetFiles.length})
              <ChevronDown className="size-3.5 transition group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="absolute bottom-12 left-0 z-20 w-64 overflow-hidden rounded-xl border border-white/10 bg-[#111827] p-1 shadow-2xl">
              {packetFiles.map((artifact) => (
                <a key={artifact.id} href={fileHref(artifact.id)} target="_blank" className="block rounded-lg px-3 py-2.5 text-[12px] text-[#cfd7e5] hover:bg-white/[0.07] hover:text-white">
                  {artifact.label.split(" — ").at(-1)}
                </a>
              ))}
            </div>
          </details>
        ) : null}
      </div>
    </article>
  );
}

export function CommandCenter() {
  const [view, setView] = useState<View>("pipeline");
  const [query, setQuery] = useState("");
  const [stages, setStages] = useState<Record<string, ApplicationStage>>(initialStages);

  useEffect(() => {
    let cancelled = false;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const persisted = JSON.parse(saved) as Record<string, ApplicationStage>;
        queueMicrotask(() => {
          if (!cancelled) setStages((current) => ({ ...current, ...persisted }));
        });
      }
    } catch {
      // A private/incognito browser may disable storage; the dashboard still works.
    }
    return () => { cancelled = true; };
  }, []);

  function changeStage(id: string, stage: ApplicationStage) {
    setStages((current) => {
      const next = { ...current, [id]: stage };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const counts = useMemo(() => ({
    live: opportunities.filter((job) => job.liveStatus === "live").length,
    tailored: resumes.filter((resume) => resume.kind === "tailored").length,
    applied: opportunities.filter((job) => ["applied", "interview"].includes(stages[job.id])).length,
    ready: opportunities.filter((job) => stages[job.id] === "ready").length,
  }), [stages]);

  const visibleJobs = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return opportunities.filter((job) => !needle || [job.company, job.role, job.location, job.salary].join(" ").toLowerCase().includes(needle));
  }, [query]);

  return (
    <main className="command-center min-h-dvh bg-[#0f151d] pb-32 text-[#f5f7fb]">
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6 lg:px-8">
        <header className="flex min-h-12 items-center gap-2 border-b border-[#2b3542] pb-4">
          <BriefcaseBusiness className="size-5 text-[#6f9bea]" aria-hidden="true" />
          <h1 className="text-xl font-semibold tracking-[-0.03em]">Apply</h1>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4" aria-label="Application summary">
          {[
            [counts.live, "Live targets"],
            [counts.tailored, "Tailored résumés"],
            [counts.ready, "Ready to apply"],
            [counts.applied, "Submitted"],
          ].map(([value, label]) => (
            <div key={label} className="rounded-xl border border-[#2b3542] bg-[#151d27] px-4 py-4">
              <div className="text-2xl font-semibold tracking-[-0.04em] text-white">{value}</div>
              <div className="mt-1 text-[11px] font-medium text-[#8794a9]">{label}</div>
            </div>
          ))}
        </section>

        <div id="pipeline" className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-fit rounded-xl border border-[#2b3542] bg-[#151d27] p-1">
            {([[
              "pipeline", "Applications",
            ], ["resumes", "Résumé library"], ["files", "Reference files"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setView(value)} className={`h-9 rounded-lg px-4 text-[11px] font-semibold transition-colors ${view === value ? "bg-[#4f7fd8] text-white" : "text-[#8e9aaf] hover:text-white"}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="relative block w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#718096]" aria-hidden="true" />
            <span className="sr-only">Search command center</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search" className="h-11 w-full rounded-xl border border-[#303b49] bg-[#151d27] pl-10 pr-4 text-[13px] text-white outline-none placeholder:text-[#657288] focus:border-[#6f9bea] focus:ring-2 focus:ring-[#4f7fd8]/20" />
          </label>
        </div>

        {view === "pipeline" ? (
          <section className="mt-4 grid gap-3 lg:grid-cols-2" aria-label="Application pipeline">
            {visibleJobs.map((job) => (
              <OpportunityCard key={job.id} job={job} stage={stages[job.id] ?? "not_started"} onStageChange={(stage) => changeStage(job.id, stage)} />
            ))}
          </section>
        ) : null}

        {view === "resumes" ? (
          <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Résumé library">
            {resumes.filter((resume) => !query || resume.label.toLowerCase().includes(query.toLowerCase())).map((resume) => (
              <article key={resume.id} className="flex min-h-44 flex-col rounded-2xl border border-[#2b3542] bg-[#151d27] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="grid size-10 place-items-center rounded-xl border border-[#303b49] bg-[#18212c] text-[#6f9bea]"><FileText className="size-4.5" aria-hidden="true" /></div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${resume.status === "ready" ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200" : "border-amber-200/15 bg-amber-200/[0.06] text-amber-100"}`}>{resume.status === "ready" ? "Ready" : "Needs review"}</span>
                </div>
                <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#7f8ba0]">{resume.kind === "base" ? "Base résumé" : "Tailored résumé"}</div>
                <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.025em] text-white">{resume.label}</h2>
                <a href={fileHref(resume.id)} target="_blank" className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#303b49] bg-[#18212c] px-4 text-[12px] font-semibold text-[#eef2f8] hover:bg-[#202b38]">Open <ArrowUpRight className="size-3.5" aria-hidden="true" /></a>
              </article>
            ))}
          </section>
        ) : null}

        {view === "files" ? (
          <section className="mt-4 overflow-hidden rounded-2xl border border-[#2b3542] bg-[#151d27]" aria-label="Reference files">
            {allWorkspaceArtifacts.filter((artifact) => !query || artifact.label.toLowerCase().includes(query.toLowerCase())).map((artifact) => (
              <a key={artifact.id} href={fileHref(artifact.id)} target="_blank" className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3.5 last:border-b-0 hover:bg-white/[0.035] sm:px-5">
                <FileText className="size-4 shrink-0 text-[#6f9bea]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#dfe5ef]">{artifact.label}</span>
                <span className="hidden text-[10px] uppercase tracking-[0.1em] text-[#6f7c91] sm:block">{artifact.fileName.split(".").at(-1)}</span>
                <ArrowUpRight className="size-3.5 shrink-0 text-[#7d899d]" aria-hidden="true" />
              </a>
            ))}
          </section>
        ) : null}

      </div>
    </main>
  );
}
