"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  FileSearch2,
  LoaderCircle,
  ShieldAlert,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  generateManualJobGauntletAction,
  importManualJobGauntletAction,
} from "@/features/analysis/actions";
import type { JobGauntletAnalysis } from "@/features/analysis/schema";
import type { ManualPromptRun } from "@/features/analysis/service";

type ManualGauntletPanelProps = {
  initialAnalysis: JobGauntletAnalysis | null;
  initialCompletedAt: string | null;
  initialPendingRun: ManualPromptRun | null;
  jobId: string;
};

function AnalysisList({ items }: { items: readonly string[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[#878a91]">No evidence was supplied.</p>;
  }
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-6 text-[#555960]">
          <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[#979aa1]" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-black/[0.08] py-1 pl-3.5">
      <p className="text-xs text-[#62666d]">{label}</p>
      <p className="mt-1.5 text-sm font-semibold leading-5 text-[#292b30]">{value}</p>
    </div>
  );
}

function Judgment({
  explanation,
  label,
  value,
}: {
  explanation: string;
  label: string;
  value: string;
}) {
  return (
    <div className="border-l border-black/[0.08] py-1 pl-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-semibold text-[#303238]">{label}</p>
        <p className="shrink-0 text-xs font-semibold text-[#3f5fd6]">{value}</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-[#5f636a]">{explanation}</p>
    </div>
  );
}

function formatCompletedAt(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function AnalysisReport({ analysis, completedAt }: { analysis: JobGauntletAnalysis; completedAt: string | null }) {
  return (
    <div>
      <div className="rounded-2xl bg-[#15161a] p-5 text-white sm:p-7">
        <div className="flex flex-wrap items-center gap-2 text-xs text-white/55">
          <span className="font-medium text-white/75">Detailed review</span>
          {completedAt ? <span aria-hidden="true">·</span> : null}
          {completedAt ? <span className="text-[11px] text-white/45">Updated {formatCompletedAt(completedAt)}</span> : null}
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-xs font-semibold text-white/50">Verdict</p>
            <h3 className="mt-1 text-3xl font-semibold tracking-[-0.045em]">{analysis.verdict}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">{analysis.verdictExplanation}</p>
          </div>
          <div className="flex divide-x divide-white/12 text-center">
            <div className="min-w-20 px-3 py-1"><p className="text-2xl font-semibold">{analysis.basicFit.score.toFixed(1)}</p><p className="mt-0.5 text-[11px] text-white/45">Fit / 10</p></div>
            <div className="min-w-20 px-3 py-1"><p className="text-2xl font-semibold">{analysis.stretchLevel.score.toFixed(1)}</p><p className="mt-0.5 text-[11px] text-white/45">Stretch / 10</p></div>
            <div className="min-w-20 px-3 py-1"><p className="text-2xl font-semibold">{analysis.careerValue.score.toFixed(1)}</p><p className="mt-0.5 text-[11px] text-white/45">Career / 10</p></div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-y-4 border-y border-black/[0.07] py-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Readiness" value={analysis.readinessCategory} />
        <Metric label="Callback outlook" value={analysis.callbackProbability} />
        <Metric label="Interview risk" value={analysis.interviewRisk} />
        <Metric label="Resume story" value={analysis.resumeCredibility.rating} />
        <Metric label="Compensation" value={analysis.compensationValue.rating} />
      </div>

      <details className="group mt-4 rounded-2xl border border-black/[0.06] bg-white/55">
        <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm font-semibold text-[#303238] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5577ff]/30 [&::-webkit-details-marker]:hidden sm:px-5">
          Why these judgments landed here
          <ChevronDown className="ml-auto size-4 text-[#656970] transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="grid gap-4 border-t border-black/[0.06] p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Judgment label="Basic fit" value={`${analysis.basicFit.score.toFixed(1)}/10`} explanation={analysis.basicFit.rationale} />
          <Judgment label="Stretch" value={`${analysis.stretchLevel.score.toFixed(1)}/10`} explanation={analysis.stretchLevel.rationale} />
          <Judgment label="Career value" value={`${analysis.careerValue.score.toFixed(1)}/10`} explanation={analysis.careerValue.rationale} />
          <Judgment label="Callback" value={analysis.callbackProbability} explanation={analysis.callbackProbabilityExplanation} />
          <Judgment label="Resume credibility" value={analysis.resumeCredibility.rating} explanation={analysis.resumeCredibility.rationale} />
          <Judgment label="Compensation" value={analysis.compensationValue.rating} explanation={analysis.compensationValue.rationale} />
        </div>
      </details>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-[#2f8a63]/15 bg-[#edf8f2]/70 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#245f45]"><Check className="size-4" aria-hidden="true" /> Why this could work</div>
          <div className="mt-4"><AnalysisList items={analysis.reasonsToApply} /></div>
        </section>
        <section className="rounded-2xl border border-[#b76751]/15 bg-[#fff1ed]/70 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#8a4738]"><ShieldAlert className="size-4" aria-hidden="true" /> Strongest case against it</div>
          <div className="mt-4"><AnalysisList items={analysis.reasonsNotToApply} /></div>
        </section>
      </div>

      <section className="mt-5 border-t border-black/[0.07] pt-5 sm:pt-6">
        <h3 className="text-base font-semibold">What you would actually do</h3>
        <p className="mt-3 text-sm leading-7 text-[#555960]">{analysis.dayToDaySummary}</p>
      </section>

      <div className="mt-5 grid gap-5 border-t border-black/[0.07] pt-5 lg:grid-cols-2 lg:divide-x lg:divide-black/[0.07]">
        <section className="lg:pr-5">
          <h3 className="text-sm font-semibold">Strongest evidence</h3>
          <div className="mt-4"><AnalysisList items={analysis.strongestMatches} /></div>
        </section>
        <section className="lg:pl-5">
          <h3 className="text-sm font-semibold">Qualification gaps</h3>
          <div className="mt-4"><AnalysisList items={analysis.qualificationGaps} /></div>
        </section>
      </div>

      {analysis.skillSprint ? (
        <section className="mt-5 rounded-2xl border border-[#5577ff]/15 bg-[#eef1ff]/65 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-xs font-medium text-[#5264c8]"><Target className="size-4" aria-hidden="true" /> Focused skill sprint</div>
          <h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-[#292e56]">{analysis.skillSprint.title}</h3>
          <p className="mt-1 text-xs font-semibold text-[#707bc0]">{analysis.skillSprint.duration}</p>
          <div className="mt-4"><AnalysisList items={analysis.skillSprint.actions} /></div>
        </section>
      ) : null}

      <div className="mt-5 grid gap-5 border-t border-black/[0.07] pt-5 lg:grid-cols-[1.1fr_0.9fr] lg:divide-x lg:divide-black/[0.07]">
        <section className="lg:pr-5">
          <h3 className="text-sm font-semibold">Recommended preparation</h3>
          <div className="mt-4"><AnalysisList items={analysis.recommendedPreparation} /></div>
          {analysis.recommendedPortfolioProject ? <p className="mt-5 border-t border-black/[0.06] pt-4 text-sm text-[#555960]"><span className="font-semibold text-[#292b30]">Lead with:</span> {analysis.recommendedPortfolioProject}</p> : null}
        </section>
        <section className="lg:pl-5">
          <h3 className="text-sm font-semibold">Likely interview shape</h3>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs font-medium text-[#5d6168]">{analysis.likelyInterviewFormat.map((format) => <span key={format} className="border-r border-black/10 pr-3 last:border-r-0 last:pr-0">{format.replaceAll("_", " ")}</span>)}</div>
          <p className="mt-4 text-sm leading-6 text-[#666a71]">{analysis.interviewRiskExplanation}</p>
        </section>
      </div>

      {analysis.redFlags.length > 0 || analysis.uncertaintyNotes.length > 0 ? (
        <section className="mt-5 rounded-2xl border border-[#d99a3d]/20 bg-[#fff7e9]/70 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#7d5318]"><AlertTriangle className="size-4" aria-hidden="true" /> Red flags & uncertainty</div>
          <div className="mt-4"><AnalysisList items={[...analysis.redFlags, ...analysis.uncertaintyNotes]} /></div>
        </section>
      ) : null}
    </div>
  );
}

export function ManualGauntletPanel({
  initialAnalysis,
  initialCompletedAt,
  initialPendingRun,
  jobId,
}: ManualGauntletPanelProps) {
  const [analysis, setAnalysis] = useState(initialAnalysis);
  const [completedAt, setCompletedAt] = useState(initialCompletedAt);
  const [promptRun, setPromptRun] = useState(initialPendingRun);
  const [rawResponse, setRawResponse] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generatePrompt() {
    setError(null);
    startTransition(async () => {
      try {
        const outcome = await generateManualJobGauntletAction({ jobId });
        if (!outcome.ok) {
          setError(outcome.error);
          return;
        }
        setPromptRun(outcome.result);
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "The analysis prompt could not be generated.");
      }
    });
  }

  async function copyPrompt() {
    if (!promptRun) return;
    try {
      await navigator.clipboard.writeText(promptRun.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setError("Copy was blocked. Select the prompt text and copy it manually.");
    }
  }

  function importResponse() {
    if (!promptRun || !rawResponse.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        const outcome = await importManualJobGauntletAction({
          analysisRunId: promptRun.analysisRunId,
          rawResponse,
        });
        if (!outcome.ok) {
          setError(outcome.error);
          return;
        }
        const result = outcome.result;
        setAnalysis(result.analysis);
        setCompletedAt(result.completedAt);
        setPromptRun(null);
        setRawResponse("");
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "The analysis response could not be imported.");
      }
    });
  }

  return (
    <section className="mt-6" aria-labelledby="manual-gauntlet-heading">
      <details className="group glass-panel-strong overflow-hidden rounded-2xl">
        <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 [&::-webkit-details-marker]:hidden sm:px-5">
          <FileSearch2 className="size-4 shrink-0 text-[#5b53d5]" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span id="manual-gauntlet-heading" className="block text-base font-semibold tracking-[-0.025em] text-[#202a3d]">Detailed review</span>
            <span className="mt-1 block text-xs leading-5 text-[#748093]">
              Optional second-pass review using a chat tool you already have.
            </span>
          </span>
          <span className="hidden text-[11px] font-medium text-[#7d8797] sm:block">
            {analysis ? "Review ready" : promptRun ? "In progress" : "Optional"}
          </span>
          <ChevronDown className="size-4 shrink-0 text-[#808a9a] transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="border-t border-white/70 px-4 pb-5 pt-4 sm:px-5 sm:pb-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-sm leading-6 text-[#687386]">
              The prompt uses the exact listing, profile, portfolio evidence, and current fit score. No paid API is required.
            </p>
            {!promptRun && !analysis ? <ButtonLike onClick={generatePrompt} pending={pending} /> : null}
          </div>

          {error ? <p role="alert" className="mb-4 rounded-xl border border-[#e85c68]/20 bg-[#fff1f2] p-3 text-sm text-[#9d343c]">{error}</p> : null}

          {analysis ? <AnalysisReport analysis={analysis} completedAt={completedAt} /> : null}

          {promptRun && promptRun.status !== "succeeded" ? (
            <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white/60">
          <div className="grid gap-0 border-b border-black/[0.06] sm:grid-cols-3">
            {["Copy the frozen prompt", "Run it in your chat tool", "Paste the JSON result"].map((step, index) => (
              <div key={step} className="flex items-center gap-3 border-b border-black/[0.06] px-4 py-3 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
                <span className="w-4 shrink-0 text-xs text-[#858991]">{index + 1}.</span>
                <span className="text-xs font-semibold text-[#555960]">{step}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-5 p-4 sm:p-6 lg:grid-cols-2">
            <div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="gauntlet-prompt" className="text-sm font-semibold">Analysis prompt</label>
                <Button type="button" variant="outline" size="sm" onClick={copyPrompt}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy"}</Button>
              </div>
              <textarea id="gauntlet-prompt" readOnly value={promptRun.prompt} rows={14} className="mt-3 w-full resize-y rounded-xl border border-black/[0.07] bg-white/55 p-4 font-mono text-[11px] leading-5 text-[#555960] outline-none focus:ring-2 focus:ring-[#5577ff]/30" />
            </div>
            <div>
              <label htmlFor="gauntlet-response" className="text-sm font-semibold">JSON response</label>
              <textarea id="gauntlet-response" value={rawResponse} onChange={(event) => setRawResponse(event.target.value)} rows={14} maxLength={100_000} placeholder="Paste the complete JSON object returned by your chat tool…" className="mt-3 w-full resize-y rounded-xl border border-black/[0.07] bg-white/55 p-4 font-mono text-[11px] leading-5 text-[#555960] outline-none focus:ring-2 focus:ring-[#5577ff]/30" />
              <Button type="button" onClick={importResponse} disabled={pending || rawResponse.trim().length === 0} className="mt-3 w-full">{pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Clipboard className="size-4" aria-hidden="true" />} Validate and save analysis</Button>
              <p className="mt-3 text-xs leading-5 text-[#898c92]">The request ID and input hash must match. Invalid or stale responses are rejected without replacing your current analysis.</p>
            </div>
          </div>
            </div>
          ) : null}

          {analysis && !promptRun ? (
            <details className="mt-4 rounded-xl border border-black/[0.06] bg-white/50">
              <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-[#656970] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5577ff]/30">How this review was created</summary>
              <div className="border-t border-black/[0.06] px-4 py-4 text-xs leading-5 text-[#7c8087]">This result came from a validated response tied to the exact listing, candidate profile, portfolio snapshot, prompt version, and schema version. Change the profile or listing to generate a fresh request.</div>
            </details>
          ) : null}
        </div>
      </details>
    </section>
  );
}

function ButtonLike({ onClick, pending }: { onClick: () => void; pending: boolean }) {
  return (
    <Button type="button" onClick={onClick} disabled={pending} className="shrink-0">
      {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <FileSearch2 className="size-4" aria-hidden="true" />}
      Create detailed review
    </Button>
  );
}
