import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  Clock3,
  FileText,
  MapPin,
} from "lucide-react";

import { ManualGauntletPanel } from "@/features/analysis/components/manual-gauntlet-panel";
import {
  getLatestPendingJobGauntlet,
  getLatestSuccessfulJobGauntlet,
} from "@/features/analysis/queries";
import { JobCard } from "@/features/jobs/components/job-card";
import { JobHistory } from "@/features/jobs/components/job-history";
import { StandaloneDecisionBar } from "@/features/jobs/components/standalone-decision-bar";
import {
  getJobCard,
  getJobDecisionHistory,
  getRawJobDescription,
} from "@/features/jobs/queries";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ jobId: string }>;
}): Promise<Metadata> {
  const { jobId } = await params;
  const job = await getJobCard(jobId);
  return { title: job ? `${job.title} at ${job.company}` : "Job not found" };
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const [job, rawDescription] = await Promise.all([
    getJobCard(jobId),
    getRawJobDescription(jobId),
  ]);

  if (!job || rawDescription === null) notFound();

  const [successfulGauntlet, pendingGauntlet, decisionHistory] = await Promise.all([
    getLatestSuccessfulJobGauntlet(jobId),
    getLatestPendingJobGauntlet(jobId),
    getJobDecisionHistory(jobId),
  ]);

  const decisionBrief = [
    {
      label: "Opportunity",
      value: job.decisionBrief?.opportunity ?? job.reasonsToApply[0],
    },
    {
      label: "Your edge",
      value:
        job.decisionBrief?.edge ??
        job.strongestMatches[0] ??
        "Your strongest evidence needs a closer read.",
    },
    {
      label: "Watch-out",
      value: job.decisionBrief?.risk ?? job.reasonsNotToApply[0],
    },
    {
      label: "Best move",
      value:
        job.decisionBrief?.positioningMove ??
        "Lead with the experience that most directly mirrors the role.",
    },
  ];

  const confidence = job.decisionBrief?.confidence;

  return (
    <div className="ambient-page app-viewport">
    <div className="mx-auto w-full max-w-5xl px-3 pb-28 pt-4 sm:px-6 sm:pb-32 sm:pt-7 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-3 px-1 sm:mb-5">
        <Link
          href="/"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-[#5f6878] transition-colors hover:bg-white/45 hover:text-[#172033] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6259df]/35"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Discover
        </Link>
        <span className="text-xs text-[#697383]">
          Role report
        </span>
      </div>

      <main>
        <section
          className="glass-panel-strong overflow-hidden rounded-[1.5rem]"
          aria-labelledby="role-report-title"
        >
          <div className="px-5 pb-6 pt-5 sm:px-8 sm:pb-8 sm:pt-7">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-semibold text-[#263249]">
                {job.verdict}
              </span>
              <span className="text-[#a3abba]" aria-hidden="true">·</span>
              <span className="font-medium text-[#6b7484]">
                {job.readiness}
              </span>
              {confidence ? (
                <span className="text-[11px] font-medium capitalize text-[#687386]">
                  {confidence} evidence confidence
                </span>
              ) : null}
            </div>

            <p className="mt-7 text-sm font-medium text-[#6259df]">
              {job.company}
            </p>
            <h1
              id="role-report-title"
              className="mt-2 max-w-4xl text-balance text-[2rem] font-semibold leading-[1.02] tracking-[-0.055em] text-[#141b29] sm:text-5xl"
            >
              {job.title}
            </h1>

            <div className="mt-7 grid border-y border-black/[0.07] sm:grid-cols-3 sm:divide-x sm:divide-black/[0.07]">
              <div className="border-b border-black/[0.07] px-1 py-4 sm:border-b-0 sm:px-5 sm:first:pl-1">
                <p className="text-xs font-medium text-[#646e7e]">
                  Compensation
                </p>
                <p className="mt-1.5 text-sm font-semibold tracking-[-0.01em] text-[#202a3d]">
                  {job.salaryDisplay}
                </p>
                <p className="mt-1 text-[11px] text-[#687386]">
                  {job.salarySource === "employer_posted"
                    ? "Employer-posted"
                    : "Market estimate"}
                </p>
              </div>
              <div className="border-b border-black/[0.07] px-1 py-4 sm:border-b-0 sm:px-5">
                <p className="text-xs font-medium text-[#646e7e]">
                  Location
                </p>
                <p className="mt-1.5 flex items-start gap-1.5 text-sm font-semibold tracking-[-0.01em] text-[#202a3d]">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-[#7d8797]" aria-hidden="true" />
                  <span>{job.location}</span>
                </p>
                <p className="mt-1 pl-5 text-[11px] text-[#687386]">{job.workArrangement}</p>
              </div>
              <div className="px-1 py-4 sm:px-5">
                <p className="text-xs font-medium text-[#646e7e]">
                  Source
                </p>
                <p className="mt-1.5 text-sm font-semibold tracking-[-0.01em] text-[#202a3d]">
                  {job.sourceName}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-[#687386]">
                  <Clock3 className="size-3" aria-hidden="true" />
                  {job.datePosted ? `Posted ${job.datePosted}` : "Posting date unavailable"}
                </p>
              </div>
            </div>

            {job.sourceUrl ? (
              <a
                href={job.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-[#4f596b] transition-colors hover:bg-white/45 hover:text-[#202a3d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6259df]/35"
              >
                Open original listing
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </a>
            ) : null}
          </div>
        </section>

        <section
          className="glass-dark mt-3 overflow-hidden rounded-[1.5rem] px-5 py-6 text-white sm:px-8 sm:py-8"
          aria-labelledby="decision-brief-heading"
        >
          <div>
              <p className="text-xs text-white/55">
                The 20-second read
              </p>
              <h2 id="decision-brief-heading" className="mt-2 text-xl font-semibold tracking-[-0.035em]">
                Bottom line
              </h2>
          </div>

          <p className="mt-4 max-w-3xl text-sm leading-6 text-white/68 sm:text-[15px]">
            {job.verdictExplanation}
          </p>

          <dl className="mt-6 grid border-t border-white/10 sm:grid-cols-2">
            {decisionBrief.map((item, index) => (
              <div
                key={item.label}
                className={`border-b border-white/10 py-4 sm:px-5 ${
                  index % 2 === 0 ? "sm:border-r sm:pl-0" : "sm:pr-0"
                }`}
              >
                <dt className="text-xs font-medium text-white/55">
                  {item.label}
                </dt>
                <dd className="mt-2 text-sm leading-6 text-white/76">{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-5" aria-labelledby="full-fit-report-heading">
          <details className="group glass-panel-strong overflow-hidden rounded-[1.25rem]">
            <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6259df]/30 [&::-webkit-details-marker]:hidden sm:px-5">
              <span className="min-w-0 flex-1">
                <span
                  id="full-fit-report-heading"
                  className="block text-base font-semibold tracking-[-0.025em] text-[#202a3d]"
                >
                  Full fit evidence
                </span>
                <span className="mt-1 block text-xs leading-5 text-[#748093]">
                  Scores, requirements, gaps, responsibilities, and source details.
                </span>
              </span>
              <span className="hidden text-[11px] font-medium text-[#7d8797] sm:block">
                {job.deterministicFitCoverage}% coverage
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-[#808a9a] transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="border-t border-white/75 bg-white/38">
              <JobCard job={job} embedded />
            </div>
          </details>
        </section>

        <ManualGauntletPanel
          key={successfulGauntlet?.analysisRunId ?? pendingGauntlet?.analysisRunId ?? "empty"}
          jobId={jobId}
          initialAnalysis={successfulGauntlet?.analysis ?? null}
          initialCompletedAt={successfulGauntlet?.completedAt ?? null}
          initialPendingRun={pendingGauntlet}
        />

        <div className="mt-6 grid gap-3 lg:grid-cols-2 lg:items-start">
          <details className="group glass-panel overflow-hidden rounded-[1.25rem]">
            <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6259df]/30 [&::-webkit-details-marker]:hidden sm:px-5">
              <FileText className="size-4 shrink-0 text-[#727b8a]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#202a3d]">Original listing text</span>
                <span className="mt-1 block text-xs text-[#687386]">The exact source copy, unchanged.</span>
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-[#808a9a] transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="border-t border-white/75 p-3 sm:p-4">
              <pre className="glass-input max-h-[48rem] overflow-auto whitespace-pre-wrap rounded-[1.1rem] p-4 font-mono text-[11px] leading-6 text-[#5f6878] sm:text-xs">
                {rawDescription}
              </pre>
            </div>
          </details>

          <details className="group glass-panel overflow-hidden rounded-[1.25rem]">
            <summary className="flex min-h-20 cursor-pointer list-none items-center gap-3 px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6259df]/30 [&::-webkit-details-marker]:hidden sm:px-5">
              <Clock3 className="size-4 shrink-0 text-[#727b8a]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#202a3d]">Activity & notes</span>
                <span className="mt-1 block text-xs text-[#687386]">
                  {decisionHistory.length === 0
                    ? "No decisions or notes yet."
                    : `${decisionHistory.length} ${decisionHistory.length === 1 ? "event" : "events"} recorded.`}
                </span>
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-[#808a9a] transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="border-t border-white/75 p-3 sm:p-4">
              <JobHistory items={decisionHistory} />
            </div>
          </details>
        </div>
      </main>

      <StandaloneDecisionBar currentDecision={job.currentDecision} jobId={jobId} />
    </div>
    </div>
  );
}
