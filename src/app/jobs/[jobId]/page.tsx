import type { CSSProperties, ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  MapPin,
  ShieldAlert,
} from "lucide-react";

import { ManualGauntletPanel } from "@/features/analysis/components/manual-gauntlet-panel";
import {
  getLatestPendingJobGauntlet,
  getLatestSuccessfulJobGauntlet,
} from "@/features/analysis/queries";
import { CompanyMark } from "@/features/jobs/components/company-mark";
import { companyVisual } from "@/features/jobs/components/company-visual";
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

function SignalList({
  empty,
  items,
}: {
  empty: string;
  items: readonly string[];
}) {
  if (items.length === 0) {
    return <p className="text-sm leading-6 text-[#78859a]">{empty}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="grid grid-cols-[0.75rem_1fr] gap-2.5 text-sm leading-6 text-[#c8d0de]"
        >
          <span
            className="mt-[0.6rem] size-1 rounded-full bg-[#8176ff]"
            aria-hidden="true"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function EditorialSection({
  children,
  description,
  id,
  number,
  title,
}: {
  children: ReactNode;
  description: string;
  id: string;
  number: string;
  title: string;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-28 border-t border-white/10 py-8 sm:py-10"
      aria-labelledby={`${id}-heading`}
    >
      <div className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
        <header>
          <p className="font-mono text-[11px] tracking-[0.16em] text-[#8176ff]">
            {number}
          </p>
          <h2
            id={`${id}-heading`}
            className="mt-2 text-xl font-semibold tracking-[-0.035em] text-[#f6f8fc]"
          >
            {title}
          </h2>
          <p className="mt-2 max-w-xs text-xs leading-5 text-[#78859a]">
            {description}
          </p>
        </header>
        <div className="min-w-0">{children}</div>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0 py-4 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-[11px] font-medium tracking-[0.06em] text-[#78859a]">
        {label}
      </dt>
      <dd className="mt-1.5 text-sm font-medium leading-5 text-[#e4e9f2]">
        {value}
      </dd>
    </div>
  );
}

function sourceLabel(source: "employer_posted" | "externally_estimated" | "unknown") {
  if (source === "employer_posted") return "Employer posted";
  if (source === "externally_estimated") return "Market estimate";
  return "Source not verified";
}

function clampScore(score: number) {
  return Math.max(0, Math.min(10, score));
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

  const visual = companyVisual(job.company);
  const confidence = job.decisionBrief?.confidence;
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
        "The strongest supporting evidence still needs a closer read.",
    },
    {
      label: "Watch-out",
      value: job.decisionBrief?.risk ?? job.reasonsNotToApply[0],
    },
    {
      label: "Positioning move",
      value:
        job.decisionBrief?.positioningMove ??
        "Lead with the experience that most directly mirrors the role.",
    },
  ];
  const roleFacts = [
    job.employmentType,
    job.seniority ?? "Seniority not specified",
    job.travelRequirement ? `Travel: ${job.travelRequirement}` : "Travel not specified",
    job.applicationDeadline
      ? `Apply by ${job.applicationDeadline}`
      : "No application deadline listed",
  ];

  return (
    <div className="min-h-dvh bg-[#060913] text-[#f6f8fc]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 h-[34rem] bg-[radial-gradient(circle_at_68%_6%,rgba(118,107,255,.16),transparent_34%),radial-gradient(circle_at_20%_10%,rgba(54,97,145,.14),transparent_30%)]"
      />

      <div className="relative mx-auto w-full max-w-6xl px-4 pb-36 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pb-40 lg:px-8">
        <header className="pt-2 sm:pt-4">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-4 text-xs font-medium text-[#c7cfdd] backdrop-blur-xl transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/60"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Discover
            </Link>
            <p className="text-[11px] font-medium tracking-[0.08em] text-[#78859a]">
              DECISION BRIEF
            </p>
          </div>

          <div className="mt-8 grid gap-6 sm:mt-10 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:items-start">
            <div
              className="grid size-[5.5rem] place-items-center overflow-hidden rounded-[1.35rem] border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,.28),0_18px_45px_rgba(0,0,0,.3)]"
              style={
                {
                  background: visual.background,
                  color: visual.foreground,
                } as CSSProperties
              }
            >
              <CompanyMark compact company={job.company} className="size-9 max-w-[72%]" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                <span className="font-semibold text-[#9c94ff]">{job.company}</span>
                <span className="text-white/25" aria-hidden="true">/</span>
                <span className="text-[#a9b4c8]">{job.verdict}</span>
                <span className="text-white/25" aria-hidden="true">/</span>
                <span className="text-[#78859a]">{job.readiness}</span>
                {confidence ? (
                  <>
                    <span className="text-white/25" aria-hidden="true">/</span>
                    <span className="capitalize text-[#78859a]">
                      {confidence} confidence
                    </span>
                  </>
                ) : null}
              </div>

              <h1 className="mt-3 max-w-4xl text-balance text-[clamp(2.15rem,8vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.055em] text-[#f6f8fc]">
                {job.title}
              </h1>

              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[#a9b4c8]">
                <span className="inline-flex items-center gap-2">
                  <MapPin className="size-4 text-[#8176ff]" aria-hidden="true" />
                  {job.location}
                </span>
                <span className="inline-flex items-center gap-2">
                  <BriefcaseBusiness className="size-4 text-[#8176ff]" aria-hidden="true" />
                  {job.workArrangement}
                </span>
                <span className="inline-flex items-center gap-2">
                  <Clock3 className="size-4 text-[#8176ff]" aria-hidden="true" />
                  {job.datePosted ? `Posted ${job.datePosted}` : "Date not listed"}
                </span>
              </div>
            </div>
          </div>

          <dl className="mt-8 grid divide-y divide-white/10 border-y border-white/10 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            <Fact
              label="COMPENSATION"
              value={
                <>
                  <span className="block text-lg font-semibold tracking-[-0.025em] text-[#a69fff]">
                    {job.salaryDisplay}
                  </span>
                  <span className="mt-1 block text-[11px] font-normal text-[#78859a]">
                    {sourceLabel(job.salarySource)}
                  </span>
                </>
              }
            />
            <Fact label="WORK MODE" value={job.workArrangement} />
            <Fact label="EMPLOYMENT" value={job.employmentType} />
            <Fact
              label="FIT SIGNAL"
              value={`${clampScore(job.deterministicFitScore).toFixed(1)} / 10 · ${job.deterministicFitCoverage}% known`}
            />
          </dl>
        </header>

        <nav
          aria-label="Role brief sections"
          className="sticky top-[max(.75rem,env(safe-area-inset-top))] z-30 -mx-2 mt-6 overflow-x-auto rounded-2xl border border-white/10 bg-[#0a0f1b]/85 p-1.5 shadow-[0_16px_45px_rgba(0,0,0,.28)] backdrop-blur-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="grid min-w-[25rem] grid-cols-4 gap-1">
            {[
              ["overview", "Overview"],
              ["fit", "Fit"],
              ["company", "Company"],
              ["listing", "Listing"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={`#${href}`}
                className="grid min-h-10 place-items-center rounded-xl px-3 text-xs font-medium text-[#98a4b8] transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/60"
              >
                {label}
              </a>
            ))}
          </div>
        </nav>

        <main className="mt-6">
          <EditorialSection
            id="overview"
            number="01"
            title="Overview"
            description="The role, reduced to the information that changes the decision."
          >
            <div className="max-w-3xl">
              <p className="text-lg leading-8 tracking-[-0.015em] text-[#d9dfeb]">
                {job.summary}
              </p>
              <div className="mt-7 border-l-2 border-[#8176ff] pl-5">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-[#9c94ff]">
                  BOTTOM LINE
                </p>
                <p className="mt-2 text-sm leading-6 text-[#b8c2d2]">
                  {job.verdictExplanation}
                </p>
              </div>
            </div>

            <dl className="mt-8 grid border-t border-white/10 sm:grid-cols-2">
              {decisionBrief.map((item, index) => (
                <div
                  key={item.label}
                  className={`border-b border-white/10 py-5 sm:px-6 ${
                    index % 2 === 0 ? "sm:border-r sm:pl-0" : "sm:pr-0"
                  }`}
                >
                  <dt className="text-[11px] font-medium tracking-[0.08em] text-[#78859a]">
                    {item.label.toUpperCase()}
                  </dt>
                  <dd className="mt-2 text-sm leading-6 text-[#c8d0de]">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>

            {job.responsibilities.length > 0 ? (
              <details className="group mt-6 border-y border-white/10">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-3 text-sm font-medium text-[#dce2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/50 [&::-webkit-details-marker]:hidden">
                  What you would actually do
                  <span className="ml-auto text-[11px] font-normal text-[#78859a]">
                    {job.responsibilities.length} responsibilities
                  </span>
                  <ChevronDown
                    className="size-4 text-[#78859a] transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <div className="border-t border-white/10 py-5">
                  <SignalList
                    items={job.responsibilities}
                    empty="The employer did not spell out the day-to-day responsibilities."
                  />
                </div>
              </details>
            ) : null}
          </EditorialSection>

          <EditorialSection
            id="fit"
            number="02"
            title="Fit"
            description="Evidence, uncertainty, and the gaps worth resolving before you apply."
          >
            <div className="grid border-y border-white/10 sm:grid-cols-3 sm:divide-x sm:divide-white/10">
              {[
                ["Fit", job.deterministicFitScore, `${job.deterministicFitCoverage}% evidence coverage`],
                ["Career value", job.careerValueScore, "Longer-term upside"],
                ["Stretch", job.stretchScore, "Lower can mean less friction"],
              ].map(([label, rawScore, helper]) => {
                const score = clampScore(Number(rawScore));
                return (
                  <div key={String(label)} className="py-5 sm:px-6 sm:first:pl-0 sm:last:pr-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-xs font-medium text-[#a9b4c8]">{label}</p>
                      <p className="text-lg font-semibold tabular-nums text-[#f6f8fc]">
                        {score.toFixed(1)}<span className="text-[11px] font-normal text-[#78859a]"> / 10</span>
                      </p>
                    </div>
                    <div className="mt-3 h-px bg-white/10">
                      <div
                        className="h-px bg-[#8176ff]"
                        style={{ width: `${score * 10}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] leading-4 text-[#78859a]">{helper}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 grid gap-8 lg:grid-cols-2 lg:gap-10">
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#e4e9f2]">
                  <Check className="size-4 text-[#8176ff]" aria-hidden="true" />
                  Evidence in your favor
                </h3>
                <div className="mt-4">
                  <SignalList items={job.strongestMatches} empty="No strong match has been confirmed yet." />
                </div>
              </section>
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#e4e9f2]">
                  <ShieldAlert className="size-4 text-[#8176ff]" aria-hidden="true" />
                  Gaps to resolve
                </h3>
                <div className="mt-4">
                  <SignalList items={job.biggestGaps} empty="No material gap has been identified." />
                </div>
              </section>
            </div>

            <div className="mt-8 grid gap-0 border-y border-white/10 lg:grid-cols-2 lg:divide-x lg:divide-white/10">
              <details className="group py-1 lg:pr-6">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-3 text-sm font-medium text-[#dce2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/50 [&::-webkit-details-marker]:hidden">
                  Required qualifications
                  <span className="ml-auto text-[11px] font-normal text-[#78859a]">
                    {job.requiredQualifications.length}
                  </span>
                  <ChevronDown className="size-4 text-[#78859a] transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="border-t border-white/10 py-5">
                  <SignalList items={job.requiredQualifications} empty="Not specified in the listing." />
                </div>
              </details>
              <details className="group border-t border-white/10 py-1 lg:border-t-0 lg:pl-6">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-3 text-sm font-medium text-[#dce2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/50 [&::-webkit-details-marker]:hidden">
                  Preferred qualifications
                  <span className="ml-auto text-[11px] font-normal text-[#78859a]">
                    {job.preferredQualifications.length}
                  </span>
                  <ChevronDown className="size-4 text-[#78859a] transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="border-t border-white/10 py-5">
                  <SignalList items={job.preferredQualifications} empty="Not specified in the listing." />
                </div>
              </details>
            </div>

            {job.scoreBreakdown.length > 0 ? (
              <details className="group mt-6 border-b border-white/10">
                <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-3 text-sm font-medium text-[#dce2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/50 [&::-webkit-details-marker]:hidden">
                  How the fit score was built
                  <span className="ml-auto text-[11px] font-normal text-[#78859a]">Weighted evidence</span>
                  <ChevronDown className="size-4 text-[#78859a] transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="space-y-5 border-t border-white/10 py-5">
                  {job.scoreBreakdown.map((item) => {
                    const score = clampScore(item.score);
                    return (
                      <div key={item.id}>
                        <div className="flex items-baseline justify-between gap-4 text-xs">
                          <p className="font-medium text-[#c8d0de]">{item.label}</p>
                          <p className="shrink-0 tabular-nums text-[#98a4b8]">
                            {score.toFixed(1)} · {Math.round(item.weightPercent)}% weight
                          </p>
                        </div>
                        <div className="mt-2 h-px bg-white/10">
                          <div className="h-px bg-[#8176ff]" style={{ width: `${score * 10}%` }} />
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-[#78859a]">
                          {item.note ?? `${Math.round(item.coveragePercent)}% of this signal is known.`}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </details>
            ) : null}

            {job.warnings.length > 0 ? (
              <aside className="mt-7 border-l-2 border-[#8176ff] pl-5" aria-label="Evidence warnings">
                <p className="text-[11px] font-semibold tracking-[0.08em] text-[#9c94ff]">
                  VERIFY BEFORE APPLYING
                </p>
                <div className="mt-3">
                  <SignalList items={job.warnings} empty="No warning was supplied." />
                </div>
              </aside>
            ) : null}

            <div className="mt-7 [&>section]:!mt-0 [&>section>details]:!rounded-none [&>section>details]:!border-x-0 [&>section>details]:!border-white/10 [&>section>details]:!bg-transparent [&>section>details]:!shadow-none [&>section>details>summary]:!px-0 [&>section>details>summary_span]:!text-[#a9b4c8]">
              <ManualGauntletPanel
                key={successfulGauntlet?.analysisRunId ?? pendingGauntlet?.analysisRunId ?? "empty"}
                jobId={jobId}
                initialAnalysis={successfulGauntlet?.analysis ?? null}
                initialCompletedAt={successfulGauntlet?.completedAt ?? null}
                initialPendingRun={pendingGauntlet}
              />
            </div>
          </EditorialSection>

          <EditorialSection
            id="company"
            number="03"
            title="Company & source"
            description="Only facts present in the source record—no invented company lore."
          >
            <div className="flex items-start gap-4">
              <div
                className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-white/15"
                style={{ background: visual.background, color: visual.foreground }}
              >
                <CompanyMark compact company={job.company} className="size-7 max-w-[72%]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold tracking-[-0.025em] text-[#f6f8fc]">
                  {job.company}
                </h3>
                <p className="mt-1 text-sm text-[#98a4b8]">
                  Listing supplied by {job.sourceName}
                </p>
              </div>
            </div>

            <dl className="mt-7 grid divide-y divide-white/10 border-y border-white/10 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
              <Fact label="SOURCE" value={job.sourceName} />
              <Fact label="POSTED" value={job.datePosted ?? "Not available"} />
              <Fact label="LOCATION" value={job.location} />
              <Fact label="WORK MODE" value={job.workArrangement} />
            </dl>

            <div className="mt-6 flex flex-wrap gap-x-3 gap-y-2 text-xs leading-5 text-[#98a4b8]">
              {roleFacts.map((fact, index) => (
                <span key={`${fact}-${index}`} className="border-r border-white/10 pr-3 last:border-r-0 last:pr-0">
                  {fact}
                </span>
              ))}
            </div>

            {job.technologies.length > 0 ? (
              <div className="mt-7 border-t border-white/10 pt-5">
                <p className="text-[11px] font-medium tracking-[0.08em] text-[#78859a]">
                  TOOLS & TECHNOLOGIES
                </p>
                <p className="mt-3 text-sm leading-6 text-[#c8d0de]">
                  {job.technologies.join("  ·  ")}
                </p>
              </div>
            ) : null}

            <div className="mt-7 flex flex-wrap gap-3">
              {job.sourceUrl ? (
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#8176ff] px-5 text-xs font-semibold text-white shadow-[0_10px_30px_rgba(118,107,255,.22)] transition-colors hover:bg-[#857bff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#a69fff]"
                >
                  Open original listing
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              ) : null}
              {job.salarySourceUrl ? (
                <a
                  href={job.salarySourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-5 text-xs font-medium text-[#c8d0de] transition-colors hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/60"
                >
                  Salary methodology
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </a>
              ) : null}
            </div>

            {job.salaryIsEstimate ? (
              <p className="mt-5 max-w-3xl text-[11px] leading-5 text-[#78859a]">
                {job.salaryDisclosure} {job.salaryMethod}
              </p>
            ) : null}
          </EditorialSection>

          <EditorialSection
            id="listing"
            number="04"
            title="Listing"
            description="The employer text, unchanged, plus your private activity for this role."
          >
            <details className="group border-y border-white/10" open>
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-4 text-sm font-medium text-[#dce2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/50 [&::-webkit-details-marker]:hidden">
                <FileText className="size-4 text-[#8176ff]" aria-hidden="true" />
                Original employer text
                <ChevronDown className="ml-auto size-4 text-[#78859a] transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-white/10 py-6">
                <pre className="max-h-[52rem] overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-7 text-[#b5bfd0] [scrollbar-color:rgba(255,255,255,.18)_transparent]">
                  {rawDescription}
                </pre>
              </div>
            </details>

            <details className="group border-b border-white/10">
              <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-4 text-sm font-medium text-[#dce2ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8176ff]/50 [&::-webkit-details-marker]:hidden">
                <Clock3 className="size-4 text-[#8176ff]" aria-hidden="true" />
                Activity & notes
                <span className="ml-auto text-[11px] font-normal text-[#78859a]">
                  {decisionHistory.length === 0
                    ? "No activity"
                    : `${decisionHistory.length} ${decisionHistory.length === 1 ? "event" : "events"}`}
                </span>
                <ChevronDown className="size-4 text-[#78859a] transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-white/10 py-4 [&_h2]:!text-[#f6f8fc] [&_li_p]:!text-[#d6ddea] [&_section]:!p-0 [&_time]:!text-[#78859a]">
                <JobHistory items={decisionHistory} />
              </div>
            </details>
          </EditorialSection>
        </main>

        <div className="[&>div]:!border-white/10 [&>div]:!bg-[#0c121f]/95 [&>div]:!shadow-[0_18px_55px_rgba(0,0,0,.45)] [&>div]:!backdrop-blur-2xl [&_a]:!rounded-full [&_a]:!text-[#a9b4c8] [&_button]:!rounded-full [&_button]:!border-white/10 [&_button]:!bg-white/[0.06] [&_button]:!text-[#dbe2ee] [&_button:hover]:!bg-white/[0.1] [&_button:nth-of-type(3)]:!border-[#8176ff] [&_button:nth-of-type(3)]:!bg-[#8176ff] [&_button:nth-of-type(3)]:!text-white">
          <StandaloneDecisionBar
            currentDecision={job.currentDecision}
            currentDecisionEventId={job.currentDecisionEventId}
            jobId={jobId}
          />
        </div>
      </div>
    </div>
  );
}
