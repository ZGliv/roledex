import type { Metadata } from "next";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  BriefcaseBusiness,
  CircleDollarSign,
  Gauge,
  History,
  Lightbulb,
  MapPin,
  ShieldCheck,
  Target,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import type {
  CountedInsight,
  FitBandInsight,
  TechnologyInsight,
} from "@/features/insights/aggregate";
import { getMarketInsights } from "@/features/insights/queries";
import { formatAppDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Market insights",
  description: "Evidence-based patterns across the active RoleDex market sample.",
};

const fitBandStyles: Record<FitBandInsight["key"], string> = {
  high: "bg-[#18a56c]",
  promising: "bg-[#5577ff]",
  stretch: "bg-[#d79a31]",
  low: "bg-[#e2646e]",
};

function formatPercent(value: number) {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%`;
}

function displayScore(value: number | null) {
  return value === null ? "—" : value.toFixed(1);
}

function displayFitScore(value: number | null) {
  return value === null ? "—" : `${(value / 10).toFixed(1)}/10`;
}

function compactMoney(cents: number | null) {
  if (cents === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "glass-panel rounded-[1.25rem] p-5 sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}

function PanelHeading({
  eyebrow,
  icon: Icon,
  title,
}: {
  eyebrow: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-[#555960]" aria-hidden="true" />
      <div>
        <p className="text-xs text-[#656970]">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-[-0.025em] text-[#202226]">
          {title}
        </h2>
      </div>
    </div>
  );
}

function MetricCard({
  detail,
  icon: Icon,
  label,
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="glass-panel rounded-[1.1rem] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-[#656970]">{label}</p>
        <Icon className="size-4 text-[#656970]" aria-hidden="true" />
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[#15161a]">{value}</p>
      <p className="mt-1.5 text-xs leading-5 text-[#656970]">{detail}</p>
    </div>
  );
}

function RankedBars({
  items,
  tone = "neutral",
}: {
  items: readonly CountedInsight[];
  tone?: "neutral" | "coral";
}) {
  const maximum = Math.max(1, ...items.map((item) => item.count));

  return (
    <div className="mt-5 space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
            <span className="min-w-0 truncate font-semibold text-[#36383d]">{item.label}</span>
            <span className="shrink-0 text-xs tabular-nums text-[#656970]">
              {item.count} · {formatPercent(item.percentage)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#eceef1]">
            <div
              className={cn("h-full rounded-full", tone === "coral" ? "bg-[#ff6679]" : "bg-[#33363c]")}
              style={{ width: `${Math.max(4, (item.count / maximum) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TechnologyRows({ items }: { items: readonly TechnologyInsight[] }) {
  const maximum = Math.max(1, ...items.map((item) => item.count));

  return (
    <div className="mt-5 space-y-4">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1.5 flex items-center gap-2 text-sm">
            <span className="min-w-0 truncate font-semibold text-[#34363b]">{item.label}</span>
            {item.isCandidateSkill ? (
              <span className="text-[10px] font-medium text-[#16865a]">
                In profile
              </span>
            ) : null}
            <span className="ml-auto shrink-0 text-xs tabular-nums text-[#656970]">
              {item.count} · {formatPercent(item.percentage)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#eceef1]">
            <div
              className={cn(
                "h-full rounded-full",
                item.isCandidateSkill ? "bg-[#18a56c]" : "bg-[#71757d]",
              )}
              style={{ width: `${Math.max(4, (item.count / maximum) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function InsightsPage() {
  const insights = await getMarketInsights();
  const remote = insights.workArrangements.find((item) => item.key === "remote")?.count ?? 0;
  const hybrid = insights.workArrangements.find((item) => item.key === "hybrid")?.count ?? 0;
  const flexiblePercentage =
    insights.sampleSize === 0 ? 0 : ((remote + hybrid) / insights.sampleSize) * 100;
  const salaryExclusions =
    insights.salary.knownCount - insights.salary.comparableAnnualUsdCount;

  return (
    <div className="ambient-page app-viewport">
      <div className="mx-auto w-full max-w-6xl px-4 pb-14 pt-8 sm:px-6 sm:pt-10 lg:px-8">
        <header className="max-w-3xl">
          <p className="text-sm font-medium text-[#656970]">Your active market sample</p>
          <h1 className="mt-2 text-balance text-4xl font-semibold leading-[1.02] tracking-[-0.05em] text-[#15161a] sm:text-5xl">
            What the market keeps asking for.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#696d74] sm:text-base">
            Patterns across current listings, measured against the active candidate profile. Counts describe the data RoleDex has—not the whole job market.
          </p>
          <p className="mt-2 text-xs text-[#656970]">
            Recalculated {formatAppDateTime(insights.generatedAt)}
          </p>
          <Link
            href="/sessions"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 px-4")}
          >
            <History data-icon="inline-start" />
            Review research sessions
          </Link>
        </header>

        {insights.sampleSize === 0 ? (
          <Panel className="mt-8 py-14 text-center sm:py-20">
            <BarChart3 className="mx-auto size-5 text-[#6259df]" aria-hidden="true" />
            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.035em]">No active market sample yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#656970]">
              Refill official sources or add a listing. Insights appear as soon as active roles have been parsed.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Link href="/sources" className={buttonVariants()}>Refill sources</Link>
              <Link href="/jobs/new" className={buttonVariants({ variant: "outline" })}>Add a listing</Link>
            </div>
          </Panel>
        ) : (
          <>
            <section className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Market snapshot">
              <MetricCard
                detail="Current revisions marked active"
                icon={BriefcaseBusiness}
                label="Active roles"
                value={String(insights.sampleSize)}
              />
              <MetricCard
                detail={`${insights.fit.scoredCount} scored · ${displayScore(insights.fit.averageCoveragePercent)}% average evidence coverage`}
                icon={Gauge}
                label="Average fit"
                value={displayFitScore(insights.fit.averageScore)}
              />
              <MetricCard
                detail={`${insights.salary.knownCount} listings include at least one salary bound`}
                icon={CircleDollarSign}
                label="Salary visibility"
                value={formatPercent(insights.salary.knownPercentage)}
              />
              <MetricCard
                detail={`${remote} remote · ${hybrid} hybrid`}
                icon={MapPin}
                label="Flexible work"
                value={formatPercent(flexiblePercentage)}
              />
            </section>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Panel>
                <PanelHeading eyebrow="Deterministic score" icon={Target} title="Fit distribution" />
                <div className="mt-6 space-y-4">
                  {insights.fit.bands.map((band) => (
                    <div key={band.key}>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2.5">
                          <span className={cn("size-2 rounded-full", fitBandStyles[band.key])} />
                          <span className="font-semibold text-[#36383d]">{band.label}</span>
                          <span className="text-xs text-[#656970]">{band.range}</span>
                        </div>
                        <span className="text-xs tabular-nums text-[#656970]">
                          {band.count} · {formatPercent(band.percentage)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#eceef1]">
                        <div
                          className={cn("h-full rounded-full", fitBandStyles[band.key])}
                          style={{ width: `${band.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 border-t border-black/[0.07] pt-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-xs font-semibold text-[#656970]">Median score</span>
                    <strong className="text-xl tracking-[-0.03em] text-[#25272b]">
                      {displayFitScore(insights.fit.medianScore)}
                    </strong>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#656970]">
                    Fit is profile-specific, not a callback probability. Average score evidence coverage is {displayScore(insights.fit.averageCoveragePercent)}%.
                  </p>
                </div>
              </Panel>

              <Panel>
                <PanelHeading eyebrow="Location signal" icon={MapPin} title="Work arrangement" />
                <RankedBars items={insights.workArrangements} />
                <p className="mt-6 border-t border-black/[0.06] pt-4 text-xs leading-5 text-[#656970]">
                  “Unclear” stays separate. Remote restrictions inside a listing are not treated as unrestricted remote work.
                </p>
              </Panel>

              <Panel>
                <PanelHeading eyebrow="Posted compensation" icon={CircleDollarSign} title="Salary signal" />
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <div className="border-l border-black/[0.08] pl-4">
                    <p className="text-[11px] font-semibold text-[#656970]">Median complete range</p>
                    <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[#25272b]">
                      {compactMoney(insights.salary.medianAnnualMidpointCents)}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-[#656970]">
                      {insights.salary.completeAnnualRangeCount} annual USD {insights.salary.completeAnnualRangeCount === 1 ? "range" : "ranges"}
                    </p>
                  </div>
                  <div className="border-l border-black/[0.08] pl-4">
                    <p className="text-[11px] font-semibold text-[#656970]">Observed annual bounds</p>
                    <p className="mt-2 text-lg font-semibold tracking-[-0.035em] text-[#25272b]">
                      {compactMoney(insights.salary.observedLowestFloorCents)} → {compactMoney(insights.salary.observedHighestCeilingCents)}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-[#656970]">Lowest floor to highest ceiling</p>
                  </div>
                </div>
                <dl className="mt-5 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-black/[0.06] px-2 py-3">
                    <dt className="text-[10px] text-[#656970]">Employer-posted</dt>
                    <dd className="mt-1 text-lg font-semibold">{insights.salary.employerPostedCount}</dd>
                  </div>
                  <div className="rounded-xl border border-black/[0.06] px-2 py-3">
                    <dt className="text-[10px] text-[#656970]">Estimated</dt>
                    <dd className="mt-1 text-lg font-semibold">{insights.salary.estimatedCount}</dd>
                  </div>
                  <div className="rounded-xl border border-black/[0.06] px-2 py-3">
                    <dt className="text-[10px] text-[#656970]">Source unknown</dt>
                    <dd className="mt-1 text-lg font-semibold">{insights.salary.unknownSourceCount}</dd>
                  </div>
                </dl>
                <p className="mt-5 text-xs leading-5 text-[#656970]">
                  Aggregate pay comparisons use annual USD listings only. {salaryExclusions} known-salary {salaryExclusions === 1 ? "listing was" : "listings were"} excluded because the period or currency differs. Floors and ceilings can come from different roles.
                </p>
              </Panel>

              <Panel>
                <PanelHeading eyebrow="Listing mentions" icon={BarChart3} title="Top technologies" />
                {insights.technologies.length > 0 ? (
                  <TechnologyRows items={insights.technologies} />
                ) : (
                  <p className="mt-5 border-t border-black/[0.07] py-4 text-sm leading-6 text-[#656970]">
                    No technologies were extracted from the active listings.
                  </p>
                )}
                <p className="mt-6 border-t border-black/[0.06] pt-4 text-xs leading-5 text-[#656970]">
                  Each technology counts at most once per listing. A mention may be required, preferred, or contextual.
                </p>
              </Panel>

              <Panel className="lg:col-span-2">
                <div className="grid gap-7 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
                  <div>
                    <PanelHeading eyebrow="Profile comparison" icon={ShieldCheck} title="Repeated skill gaps" />
                    {insights.skillGaps.length > 0 ? (
                      <div className="mt-5 divide-y divide-black/[0.07]">
                        {insights.skillGaps.map((gap) => (
                          <span
                            key={gap.label}
                            className="flex items-center justify-between gap-3 py-2.5 text-xs font-medium text-[#4c4f55]"
                          >
                            {gap.label}
                            <span className="text-[10px] tabular-nums text-[#656970]">
                              {gap.count}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-5 text-sm leading-6 text-[#656970]">
                        No missing technology appears in at least two active listings. That does not mean the profile has no qualification gaps.
                      </p>
                    )}
                    <p className="mt-5 text-xs leading-5 text-[#656970]">
                      Gap signals compare normalized technology names with explicit active-profile skills. They do not infer proficiency or professional tenure.
                    </p>
                  </div>

                  <div className="rounded-[1.2rem] bg-[#15161a] p-5 text-white sm:p-6">
                    <div className="flex items-center gap-2 text-xs font-medium text-[#ff9aa8]">
                      <Lightbulb className="size-4" aria-hidden="true" />
                      Recommended skill sprint
                    </div>
                    {insights.recommendedSprint ? (
                      <>
                        <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">
                          Build credible {insights.recommendedSprint.skill} evidence.
                        </h3>
                        <p className="mt-3 text-sm leading-6 text-white/65">
                          {insights.recommendedSprint.rationale}
                        </p>
                        <ol className="mt-5 space-y-3">
                          {insights.recommendedSprint.steps.map((step, index) => (
                            <li key={step} className="flex gap-3 text-sm leading-6 text-white/85">
                              <span className="w-4 shrink-0 text-xs text-white/45">{index + 1}.</span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </>
                    ) : (
                      <>
                        <h3 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">Keep gathering evidence.</h3>
                        <p className="mt-3 text-sm leading-6 text-white/65">
                          The current sample does not support a repeated missing-technology recommendation yet.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </Panel>

              <Panel>
                <PanelHeading eyebrow="Sample composition" icon={BriefcaseBusiness} title="Companies represented" />
                <RankedBars items={insights.companies} tone="coral" />
                <p className="mt-6 border-t border-black/[0.06] pt-4 text-xs leading-5 text-[#656970]">
                  A company with many open roles can dominate the sample; this is not a measure of employer quality.
                </p>
              </Panel>

              <Panel>
                <PanelHeading eyebrow="Interpretation guardrails" icon={ShieldCheck} title="Read before acting" />
                <ul className="mt-5 space-y-3 text-sm leading-6 text-[#5d6168]">
                  <li className="flex gap-3">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[#d63a52]" />
                    “Active” means active in RoleDex, not independently verified open today.
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[#d63a52]" />
                    Fit scores are deterministic judgments tied to the current profile and available listing evidence.
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[#d63a52]" />
                    Technology frequency cannot tell whether a skill is mandatory, optional, or merely mentioned.
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[#d63a52]" />
                    Salary estimates remain separate from employer-posted compensation.
                  </li>
                </ul>
                <Link
                  href="/"
                  className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#c63d4a] hover:text-[#a92f3b]"
                >
                  Use the signals in the deck
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Panel>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
