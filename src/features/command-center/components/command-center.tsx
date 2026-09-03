"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleAlert,
  FileCheck2,
  FileText,
  FolderOpen,
  Search,
  Sparkles,
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
  if (stage === "ready") return "border-violet-300/25 bg-violet-300/[0.1] text-violet-100";
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
    <article className="rounded-[1.45rem] border border-white/[0.09] bg-[#0d1422]/88 p-4 shadow-[0_18px_60px_rgba(0,0,0,.2)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-[#8f9bb0]">
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
            className={`h-9 appearance-none rounded-full border py-0 pl-3 pr-8 text-[11px] font-semibold outline-none focus:ring-2 focus:ring-violet-300/30 ${stageTone(stage)}`}
          >
            {stageOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 opacity-60" aria-hidden="true" />
        </label>
      </div>

      <div className="mt-4 grid gap-2.5 text-[12px] leading-5 sm:grid-cols-2">
        <div className="rounded-xl border border-white/[0.065] bg-white/[0.025] p-3 text-[#b8c2d2]">
          <span className="font-semibold text-[#e8edf5]">Why it fits: </span>{job.fit}
        </div>
        <div className="rounded-xl border border-white/[0.065] bg-white/[0.025] p-3 text-[#b8c2d2]">
          <span className="font-semibold text-[#e8edf5]">Honest gap: </span>{job.gap}
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-violet-300/10 bg-violet-300/[0.045] px-3 py-2.5 text-[12px] leading-5 text-[#cfd4ea]">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-300" aria-hidden="true" />
        <p><span className="font-semibold text-violet-100">Next: </span>{job.nextAction}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-full bg-[#756af4] px-4 text-[12px] font-semibold text-white transition hover:bg-[#877df8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/50"
        >
          Open listing <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </a>
        {job.resumeId ? (
          <a href={fileHref(job.resumeId)} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.11] bg-white/[0.04] px-4 text-[12px] font-semibold text-[#e8edf5] hover:bg-white/[0.075]">
            <FileText className="size-3.5" aria-hidden="true" /> Résumé
          </a>
        ) : null}
        {job.id === "foundant-aic" ? (
          <a href={fileHref("review-foundant")} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-full border border-white/[0.11] bg-white/[0.04] px-4 text-[12px] font-semibold text-[#e8edf5] hover:bg-white/[0.075]">
            <FileCheck2 className="size-3.5" aria-hidden="true" /> 5-minute review
          </a>
        ) : null}
        {packetFiles.length ? (
          <details className="group relative">
            <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-full border border-white/[0.11] bg-white/[0.04] px-4 text-[12px] font-semibold text-[#e8edf5] hover:bg-white/[0.075]">
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
    <main className="command-center min-h-dvh bg-[#060913] pb-32 text-[#f5f7fb]">
      <div className="mx-auto w-full max-w-6xl px-4 pb-12 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-violet-300">
              <BriefcaseBusiness className="size-3.5" aria-hidden="true" /> Job-search command center
            </div>
            <h1 className="mt-2 font-display text-[clamp(2rem,5vw,3.6rem)] font-semibold leading-none tracking-[-0.055em]">
              Everything in one place.
            </h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#96a2b6]">
              Listings, tailored packets, résumé versions, honest gaps, and the next action—organized around submitting applications.
            </p>
          </div>
          <Link href="/saved" className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.045] px-5 text-[12px] font-semibold text-[#e8edf5] hover:bg-white/[0.075]">
            Browse all saved listings
          </Link>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4" aria-label="Application summary">
          {[
            [counts.live, "Live targets"],
            [counts.tailored, "Tailored résumés"],
            [counts.ready, "Ready to apply"],
            [counts.applied, "Submitted"],
          ].map(([value, label]) => (
            <div key={label} className="rounded-[1.2rem] border border-white/[0.085] bg-[#0c121f]/78 px-4 py-4">
              <div className="text-2xl font-semibold tracking-[-0.04em] text-white">{value}</div>
              <div className="mt-1 text-[11px] font-medium text-[#8794a9]">{label}</div>
            </div>
          ))}
        </section>

        {counts.applied === 0 ? (
          <section className="mt-5 overflow-hidden rounded-[1.5rem] border border-violet-300/15 bg-[radial-gradient(circle_at_15%_0%,rgba(124,111,255,.19),transparent_34%),linear-gradient(145deg,#11182a,#0a101c)] p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-violet-200">
                  <CircleAlert className="size-3.5" aria-hidden="true" /> Today’s constraint
                </div>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.035em] text-white">Do not reorganize past the point of action.</h2>
                <p className="mt-2 text-[13px] leading-5 text-[#aeb8ca]">Your first finish line is one submitted application. Foundant already has the most complete packet.</p>
              </div>
              <button type="button" onClick={() => { setView("pipeline"); changeStage("foundant-aic", "ready"); document.getElementById("pipeline")?.scrollIntoView({ behavior: "smooth" }); }} className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-5 text-[12px] font-semibold text-[#111827] hover:bg-[#edeaff]">
                <Check className="size-4" aria-hidden="true" /> Start Foundant
              </button>
            </div>
          </section>
        ) : null}

        <div id="pipeline" className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-fit rounded-full border border-white/[0.09] bg-white/[0.035] p-1">
            {([[
              "pipeline", "Applications",
            ], ["resumes", "Résumé library"], ["files", "Reference files"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setView(value)} className={`h-9 rounded-full px-4 text-[11px] font-semibold transition ${view === value ? "bg-white text-[#101725] shadow-sm" : "text-[#8e9aaf] hover:text-white"}`}>
                {label}
              </button>
            ))}
          </div>
          <label className="relative block w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#718096]" aria-hidden="true" />
            <span className="sr-only">Search command center</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search roles or files" className="h-11 w-full rounded-full border border-white/[0.09] bg-white/[0.035] pl-10 pr-4 text-[13px] text-white outline-none placeholder:text-[#657288] focus:border-violet-300/35 focus:ring-2 focus:ring-violet-300/15" />
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
              <article key={resume.id} className="flex min-h-48 flex-col rounded-[1.35rem] border border-white/[0.09] bg-[#0d1422]/88 p-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-violet-200"><FileText className="size-4.5" aria-hidden="true" /></div>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${resume.status === "ready" ? "border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200" : "border-amber-200/15 bg-amber-200/[0.06] text-amber-100"}`}>{resume.status === "ready" ? "Ready" : "Needs review"}</span>
                </div>
                <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#7f8ba0]">{resume.kind === "base" ? "Base résumé" : "Tailored résumé"}</div>
                <h2 className="mt-1 text-[16px] font-semibold tracking-[-0.025em] text-white">{resume.label}</h2>
                <p className="mt-2 flex-1 text-[12px] leading-5 text-[#99a5b8]">{resume.description}</p>
                <a href={fileHref(resume.id)} target="_blank" className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-full border border-white/[0.11] bg-white/[0.04] px-4 text-[12px] font-semibold text-[#eef2f8] hover:bg-white/[0.075]">Open document <ArrowUpRight className="size-3.5" aria-hidden="true" /></a>
              </article>
            ))}
          </section>
        ) : null}

        {view === "files" ? (
          <section className="mt-4 overflow-hidden rounded-[1.35rem] border border-white/[0.09] bg-[#0d1422]/88" aria-label="Reference files">
            {allWorkspaceArtifacts.filter((artifact) => !query || artifact.label.toLowerCase().includes(query.toLowerCase())).map((artifact) => (
              <a key={artifact.id} href={fileHref(artifact.id)} target="_blank" className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-3.5 last:border-b-0 hover:bg-white/[0.035] sm:px-5">
                <FileText className="size-4 shrink-0 text-[#8176ff]" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#dfe5ef]">{artifact.label}</span>
                <span className="hidden text-[10px] uppercase tracking-[0.1em] text-[#6f7c91] sm:block">{artifact.fileName.split(".").at(-1)}</span>
                <ArrowUpRight className="size-3.5 shrink-0 text-[#7d899d]" aria-hidden="true" />
              </a>
            ))}
          </section>
        ) : null}

        <p className="mt-5 text-center text-[11px] text-[#647187]">Stages are saved on this device. Personal documents open only while this app is running on your Mac.</p>
      </div>
    </main>
  );
}
